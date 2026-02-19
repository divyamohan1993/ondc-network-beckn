import type { Redis } from "ioredis";
import { eq, and, gte, lte, sql, desc, ilike } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import type { Database } from "@ondc/shared/db";

import { aggregatedLogs } from "../schema.js";
import type {
  LogEntry,
  LogLevel,
  LogQueryParams,
  LogSearchParams,
  LogStats,
  StreamOptions,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const logger = createLogger("log-aggregator");

const BATCH_INSERT_INTERVAL_MS = 2_000;
const DEFAULT_RETENTION_DAYS = 30;

// ---------------------------------------------------------------------------
// LogCollector
// ---------------------------------------------------------------------------

export class LogCollector {
  private db: Database;
  private redis: Redis;
  private subscriber: Redis;

  /** Buffer for batched inserts. */
  private buffer: LogEntry[] = [];

  /** Handle for the batch-insert timer. */
  private batchTimerHandle: ReturnType<typeof setInterval> | null = null;

  /** Handle for the auto-purge timer. */
  private purgeTimerHandle: ReturnType<typeof setInterval> | null = null;

  /** Retention period in days. */
  private retentionDays: number;

  /** SSE listeners for real-time streaming. */
  private streamListeners: Set<{
    options: StreamOptions;
    send: (entry: LogEntry) => void;
  }> = new Set();

  /** Running flag. */
  private running = false;

  constructor(
    db: Database,
    redis: Redis,
    retentionDays?: number,
  ) {
    this.db = db;
    this.redis = redis;
    this.retentionDays = retentionDays ?? DEFAULT_RETENTION_DAYS;

    // Create a separate Redis connection for subscribing
    this.subscriber = redis.duplicate();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Start the collector: batch insert timer, Redis subscription, auto-purge. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    logger.info("Starting log collector");

    // Start batch-insert timer
    this.batchTimerHandle = setInterval(() => {
      void this.flushBuffer();
    }, BATCH_INSERT_INTERVAL_MS);

    // Start auto-purge timer (runs every hour)
    this.purgeTimerHandle = setInterval(() => {
      void this.autoPurge();
    }, 3_600_000);

    // Subscribe to Redis log channels
    await this.subscribeToRedisLogs();

    logger.info(
      { retentionDays: this.retentionDays, batchIntervalMs: BATCH_INSERT_INTERVAL_MS },
      "Log collector started",
    );
  }

  /** Stop the collector. */
  async stop(): Promise<void> {
    this.running = false;

    if (this.batchTimerHandle) {
      clearInterval(this.batchTimerHandle);
      this.batchTimerHandle = null;
    }

    if (this.purgeTimerHandle) {
      clearInterval(this.purgeTimerHandle);
      this.purgeTimerHandle = null;
    }

    // Flush remaining buffered logs
    await this.flushBuffer();

    // Unsubscribe from Redis
    try {
      await this.subscriber.punsubscribe("logs:*");
      this.subscriber.disconnect();
    } catch (err) {
      logger.error({ err }, "Error unsubscribing from Redis");
    }

    this.streamListeners.clear();

    logger.info("Log collector stopped");
  }

  /** Ingest a single log entry. */
  ingest(entry: LogEntry): void {
    const normalized = this.normalizeEntry(entry);
    this.buffer.push(normalized);
    this.notifyStreamListeners(normalized);
  }

  /** Ingest multiple log entries. */
  ingestBatch(entries: LogEntry[]): void {
    for (const entry of entries) {
      const normalized = this.normalizeEntry(entry);
      this.buffer.push(normalized);
      this.notifyStreamListeners(normalized);
    }
  }

  /** Query logs with filters. */
  async queryLogs(params: LogQueryParams): Promise<{ logs: LogEntry[]; total: number }> {
    const limit = Math.min(params.limit ?? 100, 1000);
    const offset = params.offset ?? 0;

    const conditions = [];

    if (params.service) {
      conditions.push(eq(aggregatedLogs.service, params.service));
    }

    if (params.level) {
      conditions.push(eq(aggregatedLogs.level, params.level));
    }

    if (params.from) {
      conditions.push(gte(aggregatedLogs.timestamp, new Date(params.from)));
    }

    if (params.to) {
      conditions.push(lte(aggregatedLogs.timestamp, new Date(params.to)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      this.db
        .select()
        .from(aggregatedLogs)
        .where(whereClause)
        .orderBy(desc(aggregatedLogs.timestamp))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(aggregatedLogs)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      logs: logs.map((row) => ({
        id: row.id,
        service: row.service,
        level: row.level as LogLevel,
        message: row.message,
        metadata: row.metadata as Record<string, unknown> | undefined,
        timestamp: row.timestamp?.toISOString(),
      })),
      total,
    };
  }

  /** Full-text search in log messages. */
  async searchLogs(params: LogSearchParams): Promise<{ logs: LogEntry[]; total: number }> {
    const limit = Math.min(params.limit ?? 100, 1000);
    const offset = params.offset ?? 0;

    const conditions = [ilike(aggregatedLogs.message, `%${params.q}%`)];

    if (params.service) {
      conditions.push(eq(aggregatedLogs.service, params.service));
    }

    const whereClause = and(...conditions);

    const [logs, countResult] = await Promise.all([
      this.db
        .select()
        .from(aggregatedLogs)
        .where(whereClause)
        .orderBy(desc(aggregatedLogs.timestamp))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(aggregatedLogs)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      logs: logs.map((row) => ({
        id: row.id,
        service: row.service,
        level: row.level as LogLevel,
        message: row.message,
        metadata: row.metadata as Record<string, unknown> | undefined,
        timestamp: row.timestamp?.toISOString(),
      })),
      total,
    };
  }

  /** Get log statistics. */
  async getStats(): Promise<LogStats> {
    const [totalResult, byServiceResult, byLevelResult, errorRateResult, last24hResult] =
      await Promise.all([
        // Total logs
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(aggregatedLogs),

        // Counts by service
        this.db
          .select({
            service: aggregatedLogs.service,
            count: sql<number>`count(*)::int`,
          })
          .from(aggregatedLogs)
          .groupBy(aggregatedLogs.service),

        // Counts by level
        this.db
          .select({
            level: aggregatedLogs.level,
            count: sql<number>`count(*)::int`,
          })
          .from(aggregatedLogs)
          .groupBy(aggregatedLogs.level),

        // Error rate per service (errors / total for that service)
        this.db
          .select({
            service: aggregatedLogs.service,
            error_count: sql<number>`count(*) filter (where ${aggregatedLogs.level} in ('error', 'fatal'))::int`,
            total_count: sql<number>`count(*)::int`,
          })
          .from(aggregatedLogs)
          .groupBy(aggregatedLogs.service),

        // Last 24h volume
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(aggregatedLogs)
          .where(gte(aggregatedLogs.timestamp, new Date(Date.now() - 86_400_000))),
      ]);

    const byService: Record<string, number> = {};
    for (const row of byServiceResult) {
      byService[row.service] = row.count;
    }

    const byLevel: Record<string, number> = {};
    for (const row of byLevelResult) {
      if (row.level) byLevel[row.level] = row.count;
    }

    const errorRate: Record<string, number> = {};
    for (const row of errorRateResult) {
      errorRate[row.service] =
        row.total_count > 0
          ? Math.round((row.error_count / row.total_count) * 10000) / 100
          : 0;
    }

    return {
      totalLogs: totalResult[0]?.count ?? 0,
      byService,
      byLevel,
      errorRate,
      last24hVolume: last24hResult[0]?.count ?? 0,
    };
  }

  /** Purge logs older than a given date. */
  async purge(before: Date): Promise<number> {
    const result = await this.db
      .delete(aggregatedLogs)
      .where(lte(aggregatedLogs.timestamp, before))
      .returning({ id: aggregatedLogs.id });

    const count = result.length;
    logger.info({ before: before.toISOString(), purged: count }, "Logs purged");
    return count;
  }

  /** Register a stream listener for SSE. */
  addStreamListener(options: StreamOptions, send: (entry: LogEntry) => void): () => void {
    const listener = { options, send };
    this.streamListeners.add(listener);

    return () => {
      this.streamListeners.delete(listener);
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Normalize an incoming log entry. */
  private normalizeEntry(entry: LogEntry): LogEntry {
    return {
      service: entry.service,
      level: this.validateLevel(entry.level),
      message: entry.message,
      metadata: entry.metadata,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    };
  }

  /** Validate and normalize a log level. */
  private validateLevel(level: string): LogLevel {
    const valid: LogLevel[] = ["debug", "info", "warn", "error", "fatal"];
    const normalized = level.toLowerCase() as LogLevel;
    return valid.includes(normalized) ? normalized : "info";
  }

  /** Flush the buffer: batch-insert all accumulated log entries. */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Swap out the buffer atomically
    const entries = this.buffer.splice(0, this.buffer.length);

    try {
      const values = entries.map((entry) => ({
        service: entry.service,
        level: entry.level,
        message: entry.message,
        metadata: entry.metadata ?? null,
        timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      }));

      await this.db.insert(aggregatedLogs).values(values);

      logger.debug({ count: entries.length }, "Flushed log buffer to database");
    } catch (err) {
      logger.error({ err, count: entries.length }, "Failed to flush log buffer");
      // Put entries back into the buffer for retry
      this.buffer.unshift(...entries);
    }
  }

  /** Subscribe to Redis log channels for real-time collection. */
  private async subscribeToRedisLogs(): Promise<void> {
    this.subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      try {
        const entry = JSON.parse(message) as LogEntry;

        // Extract service from channel name (e.g., "logs:gateway" -> "gateway")
        const channelService = channel.replace("logs:", "");
        if (!entry.service && channelService) {
          entry.service = channelService;
        }

        this.ingest(entry);
      } catch (err) {
        logger.error({ err, channel }, "Failed to parse Redis log message");
      }
    });

    await this.subscriber.psubscribe("logs:*");
    logger.info("Subscribed to Redis logs:* channels");
  }

  /** Auto-purge old logs based on retention period. */
  private async autoPurge(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000);
    try {
      const purged = await this.purge(cutoff);
      if (purged > 0) {
        logger.info(
          { retentionDays: this.retentionDays, purged },
          "Auto-purge completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Auto-purge failed");
    }
  }

  /** Notify all SSE stream listeners about a new log entry. */
  private notifyStreamListeners(entry: LogEntry): void {
    for (const listener of this.streamListeners) {
      const { options, send } = listener;

      // Apply filters
      if (options.service && options.service !== entry.service) continue;
      if (options.level && !this.levelMatches(entry.level, options.level)) continue;

      try {
        send(entry);
      } catch {
        // Remove broken listeners
        this.streamListeners.delete(listener);
      }
    }
  }

  /** Check if a log level meets the minimum filter threshold. */
  private levelMatches(entryLevel: LogLevel, filterLevel: LogLevel): boolean {
    const hierarchy: LogLevel[] = ["debug", "info", "warn", "error", "fatal"];
    const entryIdx = hierarchy.indexOf(entryLevel);
    const filterIdx = hierarchy.indexOf(filterLevel);
    return entryIdx >= filterIdx;
  }
}
