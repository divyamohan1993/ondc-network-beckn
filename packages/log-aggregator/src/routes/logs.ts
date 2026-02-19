import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { LogCollector } from "../services/collector.js";
import type { LogEntry, LogLevel, LogQueryParams, LogSearchParams, StreamOptions } from "../types.js";

// ---------------------------------------------------------------------------
// Request body / query types
// ---------------------------------------------------------------------------

interface IngestBody {
  service: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

interface IngestBatchBody {
  entries: IngestBody[];
}

interface LogsQuery {
  service?: string;
  level?: LogLevel;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

interface SearchQuery {
  q?: string;
  service?: string;
  limit?: string;
  offset?: string;
}

interface PurgeQuery {
  before?: string;
}

interface StreamQuery {
  service?: string;
  level?: LogLevel;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all log routes on the Fastify instance.
 */
export function registerLogRoutes(
  fastify: FastifyInstance,
  collector: LogCollector,
): void {
  // -------------------------------------------------------------------------
  // POST /logs/ingest - Ingest a single log entry
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IngestBody }>(
    "/logs/ingest",
    async (request: FastifyRequest<{ Body: IngestBody }>, reply: FastifyReply) => {
      const { service, level, message, metadata } = request.body;

      if (!service || !level || !message) {
        return reply.code(400).send({
          error: "Bad request",
          message: "Fields service, level, and message are required",
        });
      }

      collector.ingest({ service, level, message, metadata });

      return reply.code(202).send({
        status: "accepted",
        message: "Log entry queued for ingestion",
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /logs/ingest/batch - Ingest multiple log entries
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IngestBatchBody }>(
    "/logs/ingest/batch",
    async (request: FastifyRequest<{ Body: IngestBatchBody }>, reply: FastifyReply) => {
      const { entries } = request.body;

      if (!Array.isArray(entries) || entries.length === 0) {
        return reply.code(400).send({
          error: "Bad request",
          message: "entries must be a non-empty array",
        });
      }

      // Validate each entry
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        if (!entry.service || !entry.level || !entry.message) {
          return reply.code(400).send({
            error: "Bad request",
            message: `Entry at index ${i} is missing required fields (service, level, message)`,
          });
        }
      }

      collector.ingestBatch(entries);

      return reply.code(202).send({
        status: "accepted",
        message: `${entries.length} log entries queued for ingestion`,
        count: entries.length,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /logs - Query logs with filters
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: LogsQuery }>(
    "/logs",
    async (request: FastifyRequest<{ Querystring: LogsQuery }>, reply: FastifyReply) => {
      const { service, level, from, to, limit, offset } = request.query;

      const params: LogQueryParams = {
        service,
        level,
        from,
        to,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      const result = await collector.queryLogs(params);

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        total: result.total,
        limit: params.limit,
        offset: params.offset,
        logs: result.logs,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /logs/search - Full-text search in log messages
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: SearchQuery }>(
    "/logs/search",
    async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
      const { q, service, limit, offset } = request.query;

      if (!q) {
        return reply.code(400).send({
          error: "Bad request",
          message: "Query parameter q is required",
        });
      }

      const params: LogSearchParams = {
        q,
        service,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      const result = await collector.searchLogs(params);

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        query: q,
        total: result.total,
        limit: params.limit,
        offset: params.offset,
        logs: result.logs,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /logs/stats - Error counts, log volume per service, per level
  // -------------------------------------------------------------------------
  fastify.get("/logs/stats", async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await collector.getStats();

    return reply.code(200).send({
      timestamp: new Date().toISOString(),
      stats,
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /logs/purge - Manually purge old logs
  // -------------------------------------------------------------------------
  fastify.delete<{ Querystring: PurgeQuery }>(
    "/logs/purge",
    async (request: FastifyRequest<{ Querystring: PurgeQuery }>, reply: FastifyReply) => {
      const { before } = request.query;

      if (!before) {
        return reply.code(400).send({
          error: "Bad request",
          message: "Query parameter before (ISO date) is required",
        });
      }

      const beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return reply.code(400).send({
          error: "Bad request",
          message: "Invalid date format for before parameter",
        });
      }

      const purged = await collector.purge(beforeDate);

      return reply.code(200).send({
        message: "Logs purged",
        purgedCount: purged,
        before: beforeDate.toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /logs/stream - SSE endpoint for real-time log tailing
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: StreamQuery }>(
    "/logs/stream",
    async (request: FastifyRequest<{ Querystring: StreamQuery }>, reply: FastifyReply) => {
      const { service, level } = request.query;

      const options: StreamOptions = { service, level };

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send initial comment to establish the connection
      reply.raw.write(": connected\n\n");

      // Keep-alive heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        reply.raw.write(": heartbeat\n\n");
      }, 30_000);

      // Register stream listener
      const removeListener = collector.addStreamListener(options, (entry: LogEntry) => {
        const data = JSON.stringify(entry);
        reply.raw.write(`data: ${data}\n\n`);
      });

      // Clean up on client disconnect
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        removeListener();
      });
    },
  );
}
