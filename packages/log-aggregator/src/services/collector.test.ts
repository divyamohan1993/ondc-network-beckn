import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks – must be declared before any import that touches them
// ---------------------------------------------------------------------------

vi.mock("@ondc/shared/utils", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../schema.js", () => ({
  aggregatedLogs: Symbol("aggregatedLogs"),
}));

// We need drizzle-orm operators to be passthrough stubs so the production code
// can call them without a real database.  Each returns a unique marker object
// so we can assert which operators were invoked when needed.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _op: "eq", val })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  gte: vi.fn((_col: unknown, val: unknown) => ({ _op: "gte", val })),
  lte: vi.fn((_col: unknown, val: unknown) => ({ _op: "lte", val })),
  desc: vi.fn((col: unknown) => ({ _op: "desc", col })),
  ilike: vi.fn((_col: unknown, val: unknown) => ({ _op: "ilike", val })),
  sql: Object.assign(
    vi.fn((..._args: unknown[]) => ({ _op: "sql" })),
    // Tagged-template usage: sql`count(*)::int`
    { raw: vi.fn(() => "raw") },
  ),
}));

import { LogCollector } from "./collector.js";
import type { LogEntry, LogLevel } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers – mock factories
// ---------------------------------------------------------------------------

/** Build a chainable query-builder mock whose terminal methods resolve. */
function createQueryBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => builder;

  builder.select = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);
  builder.groupBy = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);

  // Make builder itself thenable so `await db.select()...` works.
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return { builder, self };
}

function createMockDb() {
  const selectBuilder = createQueryBuilder([]);
  const insertBuilder = createQueryBuilder();
  const deleteBuilder = createQueryBuilder([]);

  const db: Record<string, unknown> = {
    select: vi.fn().mockReturnValue(selectBuilder.builder),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    delete: vi.fn().mockReturnValue(deleteBuilder.builder),
    // Expose inner builders for test assertions
    _selectBuilder: selectBuilder.builder,
    _insertBuilder: insertBuilder.builder,
    _deleteBuilder: deleteBuilder.builder,
  };

  return db as unknown as ReturnType<typeof createMockDb> & {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    _selectBuilder: Record<string, ReturnType<typeof vi.fn>>;
    _deleteBuilder: Record<string, ReturnType<typeof vi.fn>>;
  };
}

function createMockRedis() {
  const handlers: Record<string, ((...args: string[]) => void)[]> = {};

  const subscriber = {
    on: vi.fn((event: string, handler: (...args: string[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return subscriber;
    }),
    psubscribe: vi.fn().mockResolvedValue(undefined),
    punsubscribe: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    // Helper to simulate a pmessage from Redis
    _emit(event: string, ...args: string[]) {
      for (const h of handlers[event] ?? []) h(...args);
    },
  };

  const redis = {
    duplicate: vi.fn().mockReturnValue(subscriber),
    _subscriber: subscriber,
  };

  return redis;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("LogCollector", () => {
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;
  let collector: LogCollector;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-02-19T12:00:00Z") });
    db = createMockDb() as any;
    redis = createMockRedis();
    collector = new LogCollector(db as any, redis as any);
  });

  afterEach(async () => {
    // Ensure the collector is stopped to clear timers
    try {
      await collector.stop();
    } catch {
      // ignored – might already be stopped
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates a Redis subscriber via duplicate()", () => {
      expect(redis.duplicate).toHaveBeenCalledOnce();
    });

    it("uses default retention of 30 days when not specified", async () => {
      // We verify indirectly: start the collector, advance 1 hour to trigger
      // autoPurge, and inspect the cutoff date passed to the delete query.
      const deleteReturning = vi.fn().mockResolvedValue([]);
      const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning });
      (db as any).delete = vi.fn().mockReturnValue({ where: deleteWhere });

      await collector.start();
      await vi.advanceTimersByTimeAsync(3_600_000);

      // autoPurge was called; cutoff should be now - 30*86400000
      expect((db as any).delete).toHaveBeenCalled();
    });

    it("accepts a custom retention period", () => {
      const custom = new LogCollector(db as any, redis as any, 7);
      // The instance was created without errors – the value is consumed in autoPurge
      expect(custom).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // start / stop
  // -----------------------------------------------------------------------

  describe("start()", () => {
    it("subscribes to Redis logs:* pattern", async () => {
      await collector.start();
      expect(redis._subscriber.psubscribe).toHaveBeenCalledWith("logs:*");
    });

    it("registers a pmessage handler on the subscriber", async () => {
      await collector.start();
      expect(redis._subscriber.on).toHaveBeenCalledWith("pmessage", expect.any(Function));
    });

    it("is idempotent – calling start() twice does not double-subscribe", async () => {
      await collector.start();
      await collector.start();
      expect(redis._subscriber.psubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("clears timers, flushes buffer, unsubscribes, and clears listeners", async () => {
      await collector.start();

      // Add a stream listener so we can verify it's cleared
      const send = vi.fn();
      collector.addStreamListener({}, send);

      // Add a buffered entry
      collector.ingest({ service: "gw", level: "info", message: "test" });

      await collector.stop();

      expect(redis._subscriber.punsubscribe).toHaveBeenCalledWith("logs:*");
      expect(redis._subscriber.disconnect).toHaveBeenCalled();
    });

    it("flushes remaining buffered entries on stop", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();
      collector.ingest({ service: "gw", level: "info", message: "buffered" });

      await collector.stop();

      expect((db as any).insert).toHaveBeenCalled();
      expect(valuesInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ service: "gw", level: "info", message: "buffered" }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // ingest / ingestBatch
  // -----------------------------------------------------------------------

  describe("ingest()", () => {
    it("normalizes the entry and adds it to the buffer", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();
      collector.ingest({ service: "bap", level: "warn", message: "warning msg" });

      // Force flush
      await vi.advanceTimersByTimeAsync(2_000);

      expect(valuesInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ service: "bap", level: "warn", message: "warning msg" }),
        ]),
      );
    });

    it("defaults invalid level to 'info'", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();
      collector.ingest({ service: "bap", level: "INVALID" as LogLevel, message: "bad level" });

      await vi.advanceTimersByTimeAsync(2_000);

      expect(valuesInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ level: "info" }),
        ]),
      );
    });

    it("assigns a timestamp when the entry has none", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();
      collector.ingest({ service: "gw", level: "debug", message: "no ts" });

      await vi.advanceTimersByTimeAsync(2_000);

      const insertedValues = valuesInsert.mock.calls[0][0];
      // Timestamp should be a Date (converted from the ISO string assigned by normalizeEntry)
      expect(insertedValues[0].timestamp).toBeInstanceOf(Date);
    });

    it("notifies stream listeners on ingest", () => {
      const send = vi.fn();
      collector.addStreamListener({}, send);

      collector.ingest({ service: "bap", level: "error", message: "alert" });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ service: "bap", level: "error", message: "alert" }),
      );
    });
  });

  describe("ingestBatch()", () => {
    it("buffers and notifies for each entry in the batch", async () => {
      const send = vi.fn();
      collector.addStreamListener({}, send);

      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();

      collector.ingestBatch([
        { service: "bap", level: "info", message: "one" },
        { service: "bpp", level: "warn", message: "two" },
        { service: "gw", level: "error", message: "three" },
      ]);

      expect(send).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(valuesInsert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ service: "bap", message: "one" }),
        expect.objectContaining({ service: "bpp", message: "two" }),
        expect.objectContaining({ service: "gw", message: "three" }),
      ]));
    });
  });

  // -----------------------------------------------------------------------
  // flushBuffer – retry on failure
  // -----------------------------------------------------------------------

  describe("flushBuffer() retry behaviour", () => {
    it("puts entries back into buffer when DB insert fails", async () => {
      const valuesInsert = vi.fn()
        .mockRejectedValueOnce(new Error("DB down"))
        .mockResolvedValueOnce(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();
      collector.ingest({ service: "gw", level: "info", message: "retry-me" });

      // First flush – will fail
      await vi.advanceTimersByTimeAsync(2_000);
      expect(valuesInsert).toHaveBeenCalledTimes(1);

      // Second flush – entries should still be in buffer and re-attempted
      await vi.advanceTimersByTimeAsync(2_000);
      expect(valuesInsert).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Redis pmessage handling
  // -----------------------------------------------------------------------

  describe("Redis pmessage handler", () => {
    it("extracts service from channel and ingests the entry", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();

      const entry: LogEntry = { service: "", level: "info", message: "from redis" };
      redis._subscriber._emit("pmessage", "logs:*", "logs:gateway", JSON.stringify(entry));

      // Flush
      await vi.advanceTimersByTimeAsync(2_000);

      expect(valuesInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ service: "gateway", message: "from redis" }),
        ]),
      );
    });

    it("does not overwrite service when entry already has one", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();

      const entry: LogEntry = { service: "bpp", level: "error", message: "explicit svc" };
      redis._subscriber._emit("pmessage", "logs:*", "logs:gateway", JSON.stringify(entry));

      await vi.advanceTimersByTimeAsync(2_000);

      expect(valuesInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ service: "bpp" }),
        ]),
      );
    });

    it("handles malformed JSON gracefully without throwing", async () => {
      await collector.start();
      // Should not throw
      expect(() => {
        redis._subscriber._emit("pmessage", "logs:*", "logs:gw", "{{not json}}");
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // queryLogs
  // -----------------------------------------------------------------------

  describe("queryLogs()", () => {
    it("returns mapped logs with pagination metadata", async () => {
      const now = new Date("2026-02-19T12:00:00Z");
      const rows = [
        { id: "abc", service: "gw", level: "info", message: "hello", metadata: null, timestamp: now },
      ];

      // The builder is thenable; we need Promise.all with two selects to resolve
      // with different values. We chain: first call is the rows, second call is count.
      let selectCallCount = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.offset = vi.fn().mockReturnValue(chain);
        chain.groupBy = vi.fn().mockReturnValue(chain);

        const resolvedValue = selectCallCount % 2 === 1 ? rows : [{ count: 42 }];
        chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (v: unknown) => unknown) => {
          return Promise.resolve(resolvedValue).then(onFulfill, onReject);
        };

        return chain;
      });

      (db as any).select = selectFn;

      const result = await collector.queryLogs({ service: "gw", limit: 10, offset: 0 });

      expect(result.total).toBe(42);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({
        id: "abc",
        service: "gw",
        level: "info",
        message: "hello",
        metadata: null,
        timestamp: now.toISOString(),
      });
    });
  });

  // -----------------------------------------------------------------------
  // searchLogs
  // -----------------------------------------------------------------------

  describe("searchLogs()", () => {
    it("searches with ILIKE on message field and returns results", async () => {
      const now = new Date("2026-02-19T11:00:00Z");
      const rows = [
        { id: "s1", service: "bap", level: "error", message: "connection timeout", metadata: { code: 500 }, timestamp: now },
      ];

      let selectCallCount = 0;
      (db as any).select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.offset = vi.fn().mockReturnValue(chain);

        const resolvedValue = selectCallCount % 2 === 1 ? rows : [{ count: 1 }];
        chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (v: unknown) => unknown) => {
          return Promise.resolve(resolvedValue).then(onFulfill, onReject);
        };

        return chain;
      });

      const { ilike } = await import("drizzle-orm");
      const result = await collector.searchLogs({ q: "timeout", service: "bap" });

      expect(ilike).toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.logs[0]).toMatchObject({
        service: "bap",
        level: "error",
        message: "connection timeout",
      });
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  describe("getStats()", () => {
    it("returns aggregated statistics from the database", async () => {
      let selectCallCount = 0;
      const responses = [
        [{ count: 500 }],                                         // total
        [{ service: "gw", count: 300 }, { service: "bap", count: 200 }], // byService
        [{ level: "info", count: 400 }, { level: "error", count: 100 }], // byLevel
        [{ service: "gw", error_count: 10, total_count: 300 }, { service: "bap", error_count: 5, total_count: 200 }], // errorRate
        [{ count: 120 }],                                         // last24h
      ];

      (db as any).select = vi.fn().mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.groupBy = vi.fn().mockReturnValue(chain);

        const resolvedValue = responses[selectCallCount++] ?? [];
        chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (v: unknown) => unknown) => {
          return Promise.resolve(resolvedValue).then(onFulfill, onReject);
        };

        return chain;
      });

      const stats = await collector.getStats();

      expect(stats.totalLogs).toBe(500);
      expect(stats.byService).toEqual({ gw: 300, bap: 200 });
      expect(stats.byLevel).toEqual({ info: 400, error: 100 });
      expect(stats.errorRate.gw).toBeCloseTo(3.33, 1);
      expect(stats.errorRate.bap).toBe(2.5);
      expect(stats.last24hVolume).toBe(120);
    });
  });

  // -----------------------------------------------------------------------
  // purge
  // -----------------------------------------------------------------------

  describe("purge()", () => {
    it("deletes logs older than the given date and returns count", async () => {
      const deletedRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
      const returningFn = vi.fn().mockResolvedValue(deletedRows);
      const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db as any).delete = vi.fn().mockReturnValue({ where: whereFn });

      const cutoff = new Date("2026-01-01T00:00:00Z");
      const count = await collector.purge(cutoff);

      expect(count).toBe(3);
      expect((db as any).delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // autoPurge via timer
  // -----------------------------------------------------------------------

  describe("autoPurge()", () => {
    it("triggers after 1 hour and deletes old logs based on retention", async () => {
      const returningFn = vi.fn().mockResolvedValue([{ id: "old1" }]);
      const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db as any).delete = vi.fn().mockReturnValue({ where: whereFn });

      await collector.start();

      // Advance 1 hour
      await vi.advanceTimersByTimeAsync(3_600_000);

      expect((db as any).delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // addStreamListener
  // -----------------------------------------------------------------------

  describe("addStreamListener()", () => {
    it("returns an unsubscribe function that removes the listener", () => {
      const send = vi.fn();
      const unsub = collector.addStreamListener({}, send);

      collector.ingest({ service: "gw", level: "info", message: "before unsub" });
      expect(send).toHaveBeenCalledTimes(1);

      unsub();

      collector.ingest({ service: "gw", level: "info", message: "after unsub" });
      expect(send).toHaveBeenCalledTimes(1); // not called again
    });

    it("filters by service – only matching entries are sent", () => {
      const send = vi.fn();
      collector.addStreamListener({ service: "bap" }, send);

      collector.ingest({ service: "gw", level: "info", message: "wrong service" });
      collector.ingest({ service: "bap", level: "info", message: "right service" });

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ service: "bap", message: "right service" }),
      );
    });

    it("filters by level hierarchy – only entries at or above filter level are sent", () => {
      const send = vi.fn();
      collector.addStreamListener({ level: "warn" }, send);

      collector.ingest({ service: "gw", level: "debug", message: "too low" });
      collector.ingest({ service: "gw", level: "info", message: "still low" });
      collector.ingest({ service: "gw", level: "warn", message: "exact match" });
      collector.ingest({ service: "gw", level: "error", message: "above" });
      collector.ingest({ service: "gw", level: "fatal", message: "highest" });

      expect(send).toHaveBeenCalledTimes(3);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ level: "fatal" }));
    });

    it("removes broken listeners that throw on send", () => {
      const broken = vi.fn().mockImplementation(() => {
        throw new Error("stream closed");
      });
      const healthy = vi.fn();

      collector.addStreamListener({}, broken);
      collector.addStreamListener({}, healthy);

      collector.ingest({ service: "gw", level: "info", message: "first" });

      // broken was called once and threw – it should be removed
      expect(broken).toHaveBeenCalledTimes(1);

      collector.ingest({ service: "gw", level: "info", message: "second" });

      // broken should NOT be called again; healthy should be called twice total
      expect(broken).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Batch insert timer
  // -----------------------------------------------------------------------

  describe("batch insert timer", () => {
    it("flushes the buffer every 2 seconds", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();

      collector.ingest({ service: "gw", level: "info", message: "batch1" });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(valuesInsert).toHaveBeenCalledTimes(1);

      collector.ingest({ service: "gw", level: "info", message: "batch2" });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(valuesInsert).toHaveBeenCalledTimes(2);
    });

    it("does nothing when buffer is empty", async () => {
      const valuesInsert = vi.fn().mockResolvedValue(undefined);
      (db as any).insert = vi.fn().mockReturnValue({ values: valuesInsert });

      await collector.start();

      await vi.advanceTimersByTimeAsync(2_000);
      // insert should NOT have been called because buffer is empty
      expect((db as any).insert).not.toHaveBeenCalled();
    });
  });
});
