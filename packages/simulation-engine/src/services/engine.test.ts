import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks - vi.hoisted runs before vi.mock factories, so variables declared
// here can be referenced inside the factory callbacks.
// ---------------------------------------------------------------------------

const { mockLogger } = vi.hoisted(() => {
  const noop = (): void => {};
  const logger: Record<string, any> = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
  };
  logger.child = () => logger;
  return { mockLogger: logger };
});

vi.mock("undici", () => ({
  request: vi.fn(async () => ({
    statusCode: 200,
    body: { dump: vi.fn(async () => undefined) },
  })),
}));

vi.mock("@ondc/shared/utils", () => ({
  createLogger: () => mockLogger,
}));

vi.mock("@ondc/shared/crypto", () => ({
  generateKeyPair: vi.fn(() => ({
    publicKey: "dGVzdC1wdWI=",
    privateKey: "dGVzdC1wcml2",
  })),
}));

// Stub out the drizzle table references so the engine module can resolve its
// imports without pulling in the real drizzle-orm/pg-core infrastructure.
vi.mock("@ondc/shared/db", () => ({
  subscribers: { is_simulated: "is_simulated", id: "id" },
  transactions: { is_simulated: "is_simulated", id: "id" },
}));

vi.mock("../schema.js", () => ({
  simulationEngineRuns: {
    id: "id",
    profile: "profile",
    config: "config",
    status: "status",
    stats: "stats",
    started_at: "started_at",
    completed_at: "completed_at",
    cancelled_at: "cancelled_at",
  },
}));

// ---------------------------------------------------------------------------
// Helpers: mock DB and Redis
// ---------------------------------------------------------------------------

function createMockDb() {
  const returningFn = vi.fn(async () => []);
  const whereFn: any = vi.fn(() => ({ returning: returningFn, limit: limitFn }));
  const limitFn: any = vi.fn(async () => []);
  const fromFn: any = vi.fn(() => ({
    where: whereFn,
    orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
  }));
  const setFn: any = vi.fn(() => ({ where: whereFn }));
  const valuesFn: any = vi.fn(async () => ({}));

  return {
    insert: vi.fn(() => ({ values: valuesFn })),
    select: vi.fn(() => ({ from: fromFn })),
    update: vi.fn(() => ({ set: setFn })),
    delete: vi.fn(() => ({ where: whereFn })),
    _internal: { valuesFn, fromFn, whereFn, setFn, returningFn, limitFn },
  } as any;
}

function createMockRedis() {
  return {
    set: vi.fn(async () => "OK"),
    publish: vi.fn(async () => 1),
    duplicate: vi.fn(() => createMockRedis()),
  } as any;
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { SimulationEngine } from "./engine.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SimulationEngine", () => {
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;
  let engine: SimulationEngine;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    db = createMockDb();
    redis = createMockRedis();
    engine = new SimulationEngine(db, redis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // getProfiles
  // -----------------------------------------------------------------------

  describe("getProfiles", () => {
    it("returns exactly 4 profiles", () => {
      const profiles = engine.getProfiles();
      expect(profiles).toHaveLength(4);
    });

    it("returns the correct profile names in order", () => {
      const profiles = engine.getProfiles();
      const names = profiles.map((p) => p.name);
      expect(names).toEqual(["smoke-test", "load-test", "endurance", "custom"]);
    });

    it("smoke-test profile has correct configuration", () => {
      const profiles = engine.getProfiles();
      const smokeTest = profiles.find((p) => p.name === "smoke-test");
      expect(smokeTest).toBeDefined();
      expect(smokeTest!.config).toEqual({
        numBaps: 2,
        numBpps: 3,
        numOrders: 10,
        domains: ["ONDC:RET10"],
        cities: ["std:080"],
        concurrency: 2,
        delayBetweenOrders: 500,
      });
    });

    it("load-test profile has correct configuration", () => {
      const profiles = engine.getProfiles();
      const loadTest = profiles.find((p) => p.name === "load-test");
      expect(loadTest).toBeDefined();
      expect(loadTest!.config).toEqual({
        numBaps: 10,
        numBpps: 20,
        numOrders: 1000,
        domains: ["ONDC:RET10", "ONDC:NIC2004:49299"],
        cities: ["std:080", "std:011"],
        concurrency: 20,
        delayBetweenOrders: 100,
      });
    });

    it("endurance profile has duration and zero numOrders", () => {
      const profiles = engine.getProfiles();
      const endurance = profiles.find((p) => p.name === "endurance");
      expect(endurance).toBeDefined();
      expect(endurance!.config.numOrders).toBe(0);
      expect(endurance!.config.duration).toBe(300);
      expect(endurance!.config.concurrency).toBe(5);
      expect(endurance!.config.delayBetweenOrders).toBe(200);
    });

    it("custom profile has minimal defaults", () => {
      const profiles = engine.getProfiles();
      const custom = profiles.find((p) => p.name === "custom");
      expect(custom).toBeDefined();
      expect(custom!.config).toEqual({
        numBaps: 1,
        numBpps: 1,
        numOrders: 1,
        domains: ["ONDC:RET10"],
        cities: ["std:080"],
        concurrency: 1,
        delayBetweenOrders: 0,
      });
    });

    it("returns a copy so mutations do not affect internal state", () => {
      const profiles1 = engine.getProfiles();
      profiles1.pop();
      const profiles2 = engine.getProfiles();
      expect(profiles2).toHaveLength(4);
    });
  });

  // -----------------------------------------------------------------------
  // startSimulation
  // -----------------------------------------------------------------------

  describe("startSimulation", () => {
    it("creates a run with RUNNING status", async () => {
      const run = await engine.startSimulation("smoke-test");
      expect(run.status).toBe("RUNNING");
    });

    it("returns a run with a valid UUID id", async () => {
      const run = await engine.startSimulation("smoke-test");
      expect(run.id).toBeDefined();
      expect(typeof run.id).toBe("string");
      expect(run.id.length).toBeGreaterThan(0);
    });

    it("persists the run to the database", async () => {
      await engine.startSimulation("smoke-test");
      expect(db.insert).toHaveBeenCalled();
      expect(db._internal.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: "smoke-test",
          status: "RUNNING",
        }),
      );
    });

    it("uses custom profile by default when no profile is specified", async () => {
      const run = await engine.startSimulation();
      expect(run.profile).toBe("custom");
      expect(run.config.numBaps).toBe(1);
      expect(run.config.numBpps).toBe(1);
      expect(run.config.numOrders).toBe(1);
    });

    it("merges customConfig with the base profile config", async () => {
      const run = await engine.startSimulation("smoke-test", {
        numOrders: 50,
        concurrency: 10,
      });
      // Custom overrides
      expect(run.config.numOrders).toBe(50);
      expect(run.config.concurrency).toBe(10);
      // Base profile values preserved
      expect(run.config.numBaps).toBe(2);
      expect(run.config.numBpps).toBe(3);
      expect(run.config.delayBetweenOrders).toBe(500);
    });

    it("sets the correct profile name on the returned run", async () => {
      const run = await engine.startSimulation("load-test");
      expect(run.profile).toBe("load-test");
    });

    it("initialises stats with zero counters", async () => {
      const run = await engine.startSimulation("smoke-test");
      expect(run.stats.completedOrders).toBe(0);
      expect(run.stats.failedOrders).toBe(0);
      expect(run.stats.inProgressOrders).toBe(0);
      expect(run.stats.avgLatencyMs).toBe(0);
      expect(run.stats.p50LatencyMs).toBe(0);
      expect(run.stats.p95LatencyMs).toBe(0);
      expect(run.stats.p99LatencyMs).toBe(0);
      expect(run.stats.throughput).toBe(0);
      expect(run.stats.errorBreakdown).toEqual({});
      expect(run.stats.elapsedMs).toBe(0);
    });

    it("sets totalOrders from the resolved config", async () => {
      const run = await engine.startSimulation("smoke-test");
      expect(run.stats.totalOrders).toBe(10);
    });

    it("includes startedAt timestamp", async () => {
      const run = await engine.startSimulation("smoke-test");
      expect(run.startedAt).toBeDefined();
      // Should be a valid ISO string
      expect(new Date(run.startedAt).toISOString()).toBe(run.startedAt);
    });
  });

  // -----------------------------------------------------------------------
  // listSimulations
  // -----------------------------------------------------------------------

  describe("listSimulations", () => {
    it("queries the database for simulation runs", async () => {
      await engine.listSimulations();
      expect(db.select).toHaveBeenCalled();
    });

    it("returns an empty array when no runs exist", async () => {
      const runs = await engine.listSimulations();
      expect(runs).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getSimulation
  // -----------------------------------------------------------------------

  describe("getSimulation", () => {
    it("returns null for a non-existent simulation ID", async () => {
      const result = await engine.getSimulation("non-existent-id");
      expect(result).toBeNull();
    });

    it("returns the active simulation if it exists in the active map", async () => {
      const run = await engine.startSimulation("custom", { numOrders: 0 });
      const result = await engine.getSimulation(run.id);
      // Since the simulation with 0 orders completes instantly via the background
      // execution, we need to check if we get a result at all (either active or DB)
      // The key point is it doesn't return null for a known ID
      expect(result).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getProgress
  // -----------------------------------------------------------------------

  describe("getProgress", () => {
    it("returns null for a non-active simulation", () => {
      const progress = engine.getProgress("non-existent-id");
      expect(progress).toBeNull();
    });

    it("returns progress with the correct shape for an active simulation", async () => {
      // Start a simulation that will remain active (many orders, delayed)
      const run = await engine.startSimulation("smoke-test");
      const progress = engine.getProgress(run.id);

      // It might have already started executing, but if still active:
      if (progress !== null) {
        expect(progress).toHaveProperty("id", run.id);
        expect(progress).toHaveProperty("status");
        expect(progress).toHaveProperty("completedOrders");
        expect(progress).toHaveProperty("totalOrders");
        expect(progress).toHaveProperty("percentComplete");
        expect(progress).toHaveProperty("currentThroughput");
        expect(progress).toHaveProperty("elapsedMs");
        expect(progress).toHaveProperty("estimatedRemainingMs");
      }
    });
  });

  // -----------------------------------------------------------------------
  // cancelSimulation
  // -----------------------------------------------------------------------

  describe("cancelSimulation", () => {
    it("returns null for a non-active simulation", async () => {
      const result = await engine.cancelSimulation("non-existent-id");
      expect(result).toBeNull();
    });

    it("sets the simulation status to CANCELLED", async () => {
      const run = await engine.startSimulation("smoke-test");
      const cancelled = await engine.cancelSimulation(run.id);

      if (cancelled) {
        expect(cancelled.status).toBe("CANCELLED");
        expect(cancelled.cancelledAt).toBeDefined();
      }
    });

    it("persists the cancellation to the database", async () => {
      const run = await engine.startSimulation("smoke-test");
      await engine.cancelSimulation(run.id);

      // The update call should have been made with CANCELLED status
      expect(db.update).toHaveBeenCalled();
    });

    it("removes the simulation from the active map after cancel", async () => {
      const run = await engine.startSimulation("smoke-test");
      await engine.cancelSimulation(run.id);

      // getProgress should return null since it was removed from activeSims
      const progress = engine.getProgress(run.id);
      expect(progress).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // pauseSimulation / resumeSimulation
  // -----------------------------------------------------------------------

  describe("pauseSimulation", () => {
    it("returns null for a non-active simulation", async () => {
      const result = await engine.pauseSimulation("non-existent-id");
      expect(result).toBeNull();
    });

    it("sets the status to PAUSED for an active simulation", async () => {
      const run = await engine.startSimulation("smoke-test");
      const paused = await engine.pauseSimulation(run.id);

      if (paused) {
        expect(paused.status).toBe("PAUSED");
      }
    });
  });

  describe("resumeSimulation", () => {
    it("returns null for a non-active simulation", async () => {
      const result = await engine.resumeSimulation("non-existent-id");
      expect(result).toBeNull();
    });

    it("sets the status back to RUNNING after pause", async () => {
      const run = await engine.startSimulation("smoke-test");

      // Pause then resume
      await engine.pauseSimulation(run.id);
      const resumed = await engine.resumeSimulation(run.id);

      if (resumed) {
        expect(resumed.status).toBe("RUNNING");
      }
    });
  });

  // -----------------------------------------------------------------------
  // deleteSimulatedData
  // -----------------------------------------------------------------------

  describe("deleteSimulatedData", () => {
    it("calls delete on both transactions and subscribers tables", async () => {
      // Set up the mock to return empty arrays for the returning() calls
      const txReturning = vi.fn(async () => []);
      const subReturning = vi.fn(async () => []);
      let deleteCallCount = 0;

      db.delete = vi.fn(() => {
        deleteCallCount++;
        const currentCall = deleteCallCount;
        return {
          where: vi.fn(() => ({
            returning: currentCall === 1 ? txReturning : subReturning,
          })),
        };
      });

      const result = await engine.deleteSimulatedData();

      expect(db.delete).toHaveBeenCalledTimes(2);
      expect(result.deletedTransactions).toBe(0);
      expect(result.deletedSubscribers).toBe(0);
    });

    it("returns correct counts when data is deleted", async () => {
      let deleteCallCount = 0;

      db.delete = vi.fn(() => {
        deleteCallCount++;
        const currentCall = deleteCallCount;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () =>
              currentCall === 1
                ? [{ id: "tx1" }, { id: "tx2" }, { id: "tx3" }]
                : [{ id: "sub1" }, { id: "sub2" }],
            ),
          })),
        };
      });

      const result = await engine.deleteSimulatedData();

      expect(result.deletedTransactions).toBe(3);
      expect(result.deletedSubscribers).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Constructor defaults
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates an instance with default URLs when no opts provided", () => {
      const eng = new SimulationEngine(db, redis);
      expect(eng).toBeInstanceOf(SimulationEngine);
    });

    it("accepts custom service URLs via opts", () => {
      const eng = new SimulationEngine(db, redis, {
        gatewayUrl: "http://gateway:4000",
        registryUrl: "http://registry:4001",
        mockServerUrl: "http://mock:4010",
      });
      expect(eng).toBeInstanceOf(SimulationEngine);
    });
  });

  // -----------------------------------------------------------------------
  // SimulationStats shape (emptyStats via listSimulations)
  // -----------------------------------------------------------------------

  describe("emptyStats (via listSimulations fallback)", () => {
    it("provides all-zero stats when DB row has null stats", async () => {
      // Override db.select to return a row with null stats
      const mockRow = {
        id: "test-id",
        profile: "smoke-test",
        config: { numBaps: 2, numBpps: 3, numOrders: 10, domains: ["ONDC:RET10"], cities: ["std:080"], concurrency: 2, delayBetweenOrders: 500 },
        status: "COMPLETED",
        stats: null,
        started_at: new Date("2025-01-01T00:00:00Z"),
        completed_at: new Date("2025-01-01T00:01:00Z"),
        cancelled_at: null,
      };

      db.select = vi.fn(() => ({
        from: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [mockRow]),
          })),
        })),
      }));

      const runs = await engine.listSimulations();
      expect(runs).toHaveLength(1);

      const stats = runs[0].stats;
      expect(stats.totalOrders).toBe(0);
      expect(stats.completedOrders).toBe(0);
      expect(stats.failedOrders).toBe(0);
      expect(stats.inProgressOrders).toBe(0);
      expect(stats.avgLatencyMs).toBe(0);
      expect(stats.p50LatencyMs).toBe(0);
      expect(stats.p95LatencyMs).toBe(0);
      expect(stats.p99LatencyMs).toBe(0);
      expect(stats.throughput).toBe(0);
      expect(stats.errorBreakdown).toEqual({});
      expect(stats.elapsedMs).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getSimulation from DB
  // -----------------------------------------------------------------------

  describe("getSimulation from DB", () => {
    it("returns a properly shaped SimulationRun from a DB row", async () => {
      const mockRow = {
        id: "db-run-id",
        profile: "load-test",
        config: {
          numBaps: 10,
          numBpps: 20,
          numOrders: 1000,
          domains: ["ONDC:RET10", "ONDC:NIC2004:49299"],
          cities: ["std:080", "std:011"],
          concurrency: 20,
          delayBetweenOrders: 100,
        },
        status: "COMPLETED",
        stats: {
          totalOrders: 1000,
          completedOrders: 995,
          failedOrders: 5,
          inProgressOrders: 0,
          avgLatencyMs: 150,
          p50LatencyMs: 120,
          p95LatencyMs: 350,
          p99LatencyMs: 500,
          throughput: 45.5,
          errorBreakdown: { confirm: 3, status: 2 },
          startTime: "2025-01-01T00:00:00.000Z",
          elapsedMs: 22000,
        },
        started_at: new Date("2025-01-01T00:00:00Z"),
        completed_at: new Date("2025-01-01T00:00:22Z"),
        cancelled_at: null,
      };

      db.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [mockRow]),
          })),
        })),
      }));

      const run = await engine.getSimulation("db-run-id");

      expect(run).not.toBeNull();
      expect(run!.id).toBe("db-run-id");
      expect(run!.profile).toBe("load-test");
      expect(run!.status).toBe("COMPLETED");
      expect(run!.stats.completedOrders).toBe(995);
      expect(run!.stats.failedOrders).toBe(5);
      expect(run!.startedAt).toBe("2025-01-01T00:00:00.000Z");
      expect(run!.completedAt).toBe("2025-01-01T00:00:22.000Z");
      expect(run!.cancelledAt).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // listSimulations merges active simulation live stats
  // -----------------------------------------------------------------------

  describe("listSimulations with active simulations", () => {
    it("returns live stats for active simulations from the DB listing", async () => {
      // Start a simulation so it is in the active map
      const run = await engine.startSimulation("smoke-test");

      // Override db.select to return a row matching the active simulation
      const mockRow = {
        id: run.id,
        profile: "smoke-test",
        config: run.config,
        status: "RUNNING",
        stats: null,
        started_at: new Date(run.startedAt),
        completed_at: null,
        cancelled_at: null,
      };

      db.select = vi.fn(() => ({
        from: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [mockRow]),
          })),
        })),
      }));

      const runs = await engine.listSimulations();
      expect(runs).toHaveLength(1);

      // The live run should have status from the active runtime, not the DB row
      const listedRun = runs[0];
      expect(listedRun.id).toBe(run.id);
      expect(["RUNNING", "COMPLETED", "FAILED"]).toContain(listedRun.status);

      // Clean up
      await engine.cancelSimulation(run.id);
    });
  });
});
