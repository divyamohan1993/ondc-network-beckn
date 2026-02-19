import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Dispatcher } from "undici";
import type { HealthCheckResult, ServiceDefinition } from "../types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

vi.mock("undici", () => ({
  request: vi.fn(),
}));

vi.mock("@ondc/shared/utils", () => ({
  createLogger: () => mockLogger,
}));

vi.mock("../schema.js", () => ({
  healthSnapshots: { id: "id", service: "service" },
  alerts: { id: "id", service: "service" },
}));

// Stub randomUUID for deterministic alert IDs
let uuidCounter = 0;
vi.mock("node:crypto", () => ({
  randomUUID: () => `test-uuid-${++uuidCounter}`,
}));

// ---------------------------------------------------------------------------
// Mock DB & Redis helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  const chainable = {
    values: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  return {
    insert: vi.fn().mockReturnValue(chainable),
    update: vi.fn().mockReturnValue(chainable),
    select: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  } as any;
}

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  } as any;
}

// ---------------------------------------------------------------------------
// Helper to build a mock undici response
// ---------------------------------------------------------------------------

function mockUndiciResponse(
  statusCode: number,
  body: Record<string, unknown> = {},
): { statusCode: number; body: { json: () => Promise<Record<string, unknown>>; dump: () => Promise<void> } } {
  return {
    statusCode,
    body: {
      json: vi.fn().mockResolvedValue(body),
      dump: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal test services (2 services for faster tests)
// ---------------------------------------------------------------------------

const TEST_SERVICES: ServiceDefinition[] = [
  { name: "svc-a", url: "http://localhost:4001", port: 4001, healthPath: "/health" },
  { name: "svc-b", url: "http://localhost:4002", port: 4002, healthPath: "/health" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HealthMonitor", () => {
  let HealthMonitor: typeof import("./monitor.js").HealthMonitor;
  let requestMock: ReturnType<typeof vi.fn>;
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    vi.useFakeTimers();
    uuidCounter = 0;

    // Reset mocks
    vi.clearAllMocks();

    // Re-import to get fresh module bindings with mocked undici
    const undiciMod = await import("undici");
    requestMock = undiciMod.request as unknown as ReturnType<typeof vi.fn>;

    const monitorMod = await import("./monitor.js");
    HealthMonitor = monitorMod.HealthMonitor;

    db = createMockDb();
    redis = createMockRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("initializes health map with UNKNOWN status for all services", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const statuses = monitor.getAllStatus();

      expect(statuses).toHaveLength(2);
      for (const health of statuses) {
        expect(health.currentStatus).toBe("UNKNOWN");
        expect(health.lastCheck).toBeNull();
        expect(health.history).toEqual([]);
        expect(health.uptimePercent).toBe(0);
        expect(health.avgResponseTime).toBe(0);
        expect(health.p95ResponseTime).toBe(0);
        expect(health.lastStatusChange).toBeNull();
        expect(health.downSince).toBeNull();
      }
    });

    it("uses DEFAULT_SERVICES when no services provided", () => {
      const monitor = new HealthMonitor(db, redis);
      const statuses = monitor.getAllStatus();
      expect(statuses).toHaveLength(8);

      const names = statuses.map((s) => s.service);
      expect(names).toEqual([
        "registry",
        "gateway",
        "admin",
        "bap",
        "bpp",
        "vault",
        "orchestrator",
        "mock-server",
      ]);
    });

    it("merges partial config with defaults", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        checkIntervalMs: 5000,
      });
      const config = monitor.getConfig();
      expect(config.checkIntervalMs).toBe(5000);
      expect(config.responseTimeThresholdMs).toBe(5000);
      expect(config.historySize).toBe(100);
      expect(config.prolongedDowntimeMinutes).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 2. start / stop
  // -------------------------------------------------------------------------

  describe("start()", () => {
    it("performs an immediate check and sets interval", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200, { status: "ok" }));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();

      // The immediate check is async (void this.runChecks()), advance just enough
      await vi.advanceTimersByTimeAsync(100);

      // Both services should have been checked
      expect(requestMock).toHaveBeenCalledTimes(2);
      const statuses = monitor.getAllStatus();
      for (const s of statuses) {
        expect(s.currentStatus).toBe("UP");
        expect(s.history).toHaveLength(1);
      }

      monitor.stop();
    });

    it("does nothing if already running", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      monitor.start(); // second call should be a no-op

      await vi.advanceTimersByTimeAsync(100);

      // Only 2 requests from the single immediate check
      expect(requestMock).toHaveBeenCalledTimes(2);

      monitor.stop();
    });

    it("runs periodic checks at the configured interval", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        checkIntervalMs: 10_000,
      });
      monitor.start();

      // Flush the immediate check
      await vi.advanceTimersByTimeAsync(0);
      expect(requestMock).toHaveBeenCalledTimes(2); // immediate check

      // Advance by one interval
      await vi.advanceTimersByTimeAsync(10_000);
      expect(requestMock).toHaveBeenCalledTimes(4); // +2 from interval

      // Advance by another interval
      await vi.advanceTimersByTimeAsync(10_000);
      expect(requestMock).toHaveBeenCalledTimes(6); // +2 more

      monitor.stop();
    });
  });

  describe("stop()", () => {
    it("clears intervals and sets running to false", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        checkIntervalMs: 10_000,
      });
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);
      const callsAfterStart = requestMock.mock.calls.length;

      monitor.stop();

      // Advance time — no more checks should happen
      await vi.advanceTimersByTimeAsync(30_000);
      expect(requestMock).toHaveBeenCalledTimes(callsAfterStart);
    });
  });

  // -------------------------------------------------------------------------
  // 3. getAllStatus / getServiceStatus
  // -------------------------------------------------------------------------

  describe("getAllStatus()", () => {
    it("returns an array of ServiceHealth objects for all services", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const statuses = monitor.getAllStatus();
      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses).toHaveLength(2);
      expect(statuses[0]!.service).toBe("svc-a");
      expect(statuses[1]!.service).toBe("svc-b");
    });
  });

  describe("getServiceStatus()", () => {
    it("returns the specific service health object", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const health = monitor.getServiceStatus("svc-a");
      expect(health).toBeDefined();
      expect(health!.service).toBe("svc-a");
    });

    it("returns undefined for unknown service", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      expect(monitor.getServiceStatus("nonexistent")).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. getSummary
  // -------------------------------------------------------------------------

  describe("getSummary()", () => {
    it("returns all UNKNOWN for fresh monitor", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const summary = monitor.getSummary();
      expect(summary).toEqual({ up: 0, down: 0, degraded: 0, unknown: 2, total: 2 });
    });

    it("accurately counts statuses after checks", async () => {
      // svc-a returns 200 (UP), svc-b returns 500 (DOWN)
      requestMock
        .mockResolvedValueOnce(mockUndiciResponse(200))
        .mockResolvedValueOnce(mockUndiciResponse(500));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const summary = monitor.getSummary();
      expect(summary.up).toBe(1);
      expect(summary.down).toBe(1);
      expect(summary.degraded).toBe(0);
      expect(summary.unknown).toBe(0);
      expect(summary.total).toBe(2);

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Status determination logic
  // -------------------------------------------------------------------------

  describe("status determination", () => {
    it("marks service as UP for 2xx with fast response", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200, { status: "ok" }));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        responseTimeThresholdMs: 10_000,
      });
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("UP");
      monitor.stop();
    });

    it("marks service as DOWN for 5xx status", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(500));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("DOWN");
      monitor.stop();
    });

    it("marks service as DEGRADED for 4xx status", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(404));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("DEGRADED");
      monitor.stop();
    });

    it("marks service as DOWN on network error", async () => {
      requestMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("DOWN");
      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Alerts
  // -------------------------------------------------------------------------

  describe("alerts", () => {
    it("generates SERVICE_DOWN alert when status changes from UP to DOWN", async () => {
      // First check: UP
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Second check: DOWN
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      const downAlerts = alerts.filter((a) => a.type === "SERVICE_DOWN");
      expect(downAlerts.length).toBeGreaterThanOrEqual(1);
      expect(downAlerts[0]!.severity).toBe("critical");
      expect(downAlerts[0]!.acknowledged).toBe(false);

      monitor.stop();
    });

    it("generates SERVICE_UP alert when status changes from DOWN to UP", async () => {
      // First check: UP (sets status to UP, from UNKNOWN -- no alert yet since prev was UNKNOWN)
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Second check: DOWN (transition UP->DOWN)
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      // Third check: UP (transition DOWN->UP)
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      const upAlerts = alerts.filter((a) => a.type === "SERVICE_UP");
      expect(upAlerts.length).toBeGreaterThanOrEqual(1);
      expect(upAlerts[0]!.severity).toBe("info");

      monitor.stop();
    });

    it("does not generate alert when transitioning from UNKNOWN", async () => {
      // First check: DOWN from UNKNOWN -- should NOT alert
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const alerts = monitor.getRecentAlerts();
      const downAlerts = alerts.filter((a) => a.type === "SERVICE_DOWN");
      // No SERVICE_DOWN alert because previousStatus was UNKNOWN
      expect(downAlerts).toHaveLength(0);

      monitor.stop();
    });

    it("publishes alerts to Redis", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Transition to DOWN
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      expect(redis.publish).toHaveBeenCalledWith(
        "alerts",
        expect.stringContaining("SERVICE_DOWN"),
      );

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 7. getRecentAlerts
  // -------------------------------------------------------------------------

  describe("getRecentAlerts()", () => {
    it("returns a copy of the alerts array", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const alerts1 = monitor.getRecentAlerts();
      const alerts2 = monitor.getRecentAlerts();
      // Should be equal in content but different references
      expect(alerts1).not.toBe(alerts2);

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 8. acknowledgeAlert
  // -------------------------------------------------------------------------

  describe("acknowledgeAlert()", () => {
    it("marks an alert as acknowledged", async () => {
      // Generate an alert: UP then DOWN
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      const alertId = alerts[0]!.id;

      const result = await monitor.acknowledgeAlert(alertId, "admin-user");
      expect(result).not.toBeNull();
      expect(result!.acknowledged).toBe(true);
      expect(result!.acknowledgedBy).toBe("admin-user");
      expect(result!.acknowledgedAt).toBeDefined();

      monitor.stop();
    });

    it("returns null for non-existent alert ID", async () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const result = await monitor.acknowledgeAlert("nonexistent-id");
      expect(result).toBeNull();
    });

    it("persists acknowledgement to database", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      const alertId = alerts[0]!.id;

      await monitor.acknowledgeAlert(alertId);

      expect(db.update).toHaveBeenCalled();
      expect(db._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged: true }),
      );

      monitor.stop();
    });

    it("defaults acknowledgedBy to 'system' when not provided", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      const result = await monitor.acknowledgeAlert(alerts[0]!.id);

      expect(result!.acknowledgedBy).toBe("system");

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 9. updateConfig / getConfig
  // -------------------------------------------------------------------------

  describe("updateConfig()", () => {
    it("updates config values", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const updated = monitor.updateConfig({ responseTimeThresholdMs: 3000 });
      expect(updated.responseTimeThresholdMs).toBe(3000);
      // Other values remain at default
      expect(updated.checkIntervalMs).toBe(15_000);
    });

    it("restarts the monitor if checkIntervalMs changes while running", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        checkIntervalMs: 10_000,
      });
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const callsBefore = requestMock.mock.calls.length;

      // Update interval -- this should stop + start (trigger another immediate check)
      monitor.updateConfig({ checkIntervalMs: 5000 });

      // Flush the immediate check triggered by the restart
      await vi.advanceTimersByTimeAsync(0);

      // Should have done more requests due to the restart's immediate check
      expect(requestMock.mock.calls.length).toBeGreaterThan(callsBefore);

      // Advance by new interval
      const callsAfterRestart = requestMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(requestMock.mock.calls.length).toBeGreaterThan(callsAfterRestart);

      monitor.stop();
    });
  });

  describe("getConfig()", () => {
    it("returns a copy of the current config", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const config1 = monitor.getConfig();
      const config2 = monitor.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // different references
    });

    it("returns DEFAULT_CONFIG when no overrides provided", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const config = monitor.getConfig();
      expect(config).toEqual({
        checkIntervalMs: 15_000,
        responseTimeThresholdMs: 5_000,
        historySize: 100,
        prolongedDowntimeMinutes: 5,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 10. getSLAMetrics
  // -------------------------------------------------------------------------

  describe("getSLAMetrics()", () => {
    it("returns zeroed metrics for services with no history", () => {
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      const metrics = monitor.getSLAMetrics();
      expect(metrics).toHaveLength(2);
      for (const m of metrics) {
        expect(m.uptimePercent).toBe(0);
        expect(m.avgResponseTime).toBe(0);
        expect(m.p50ResponseTime).toBe(0);
        expect(m.p95ResponseTime).toBe(0);
        expect(m.p99ResponseTime).toBe(0);
        expect(m.totalChecks).toBe(0);
        expect(m.failedChecks).toBe(0);
      }
    });

    it("computes correct SLA metrics after checks", async () => {
      // 3 checks: UP(200), UP(200), DOWN(500)
      requestMock
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-a check 1
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-b check 1
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-a check 2
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-b check 2
        .mockResolvedValueOnce(mockUndiciResponse(500)) // svc-a check 3
        .mockResolvedValueOnce(mockUndiciResponse(200)); // svc-b check 3

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0); // check 1
      await vi.advanceTimersByTimeAsync(15_000); // check 2
      await vi.advanceTimersByTimeAsync(15_000); // check 3

      const metrics = monitor.getSLAMetrics();
      const svcAMetrics = metrics.find((m) => m.service === "svc-a")!;
      const svcBMetrics = metrics.find((m) => m.service === "svc-b")!;

      // svc-a: 2 UP + 1 DOWN = 66.67% uptime
      expect(svcAMetrics.totalChecks).toBe(3);
      expect(svcAMetrics.failedChecks).toBe(1);
      expect(svcAMetrics.uptimePercent).toBeCloseTo(66.67, 0);

      // svc-b: 3 UP = 100% uptime
      expect(svcBMetrics.totalChecks).toBe(3);
      expect(svcBMetrics.failedChecks).toBe(0);
      expect(svcBMetrics.uptimePercent).toBe(100);

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 11. History ring buffer
  // -------------------------------------------------------------------------

  describe("history ring buffer", () => {
    it("limits history to configured historySize", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        historySize: 3,
        checkIntervalMs: 1000,
      });
      monitor.start();

      // Run 5 checks
      await vi.advanceTimersByTimeAsync(0); // check 1
      await vi.advanceTimersByTimeAsync(1000); // check 2
      await vi.advanceTimersByTimeAsync(1000); // check 3
      await vi.advanceTimersByTimeAsync(1000); // check 4
      await vi.advanceTimersByTimeAsync(1000); // check 5

      const health = monitor.getServiceStatus("svc-a")!;
      expect(health.history).toHaveLength(3);

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 12. Uptime percentage calculation
  // -------------------------------------------------------------------------

  describe("uptime calculation", () => {
    it("counts UP and DEGRADED as uptime, DOWN as downtime", async () => {
      requestMock
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-a UP
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-b UP
        .mockResolvedValueOnce(mockUndiciResponse(404)) // svc-a DEGRADED
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-b UP
        .mockResolvedValueOnce(mockUndiciResponse(500)) // svc-a DOWN
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-b UP
        .mockResolvedValueOnce(mockUndiciResponse(200)) // svc-a UP
        .mockResolvedValueOnce(mockUndiciResponse(200)); // svc-b UP

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(15_000);

      const health = monitor.getServiceStatus("svc-a")!;
      // 4 checks: UP, DEGRADED, DOWN, UP → 3 uptime / 4 total = 75%
      expect(health.uptimePercent).toBe(75);

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 13. DB persistence
  // -------------------------------------------------------------------------

  describe("database persistence", () => {
    it("persists health snapshots to the database", async () => {
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Should have inserted snapshots for both services
      expect(db.insert).toHaveBeenCalled();

      monitor.stop();
    });

    it("handles DB errors gracefully without crashing", async () => {
      db._chain.values.mockRejectedValue(new Error("DB connection lost"));
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();

      // Should not throw
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLogger.error).toHaveBeenCalled();
      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 14. Prolonged downtime alert
  // -------------------------------------------------------------------------

  describe("prolonged downtime", () => {
    it("generates PROLONGED_DOWNTIME alert after configured minutes", async () => {
      // First check: UP (to set the baseline, exiting UNKNOWN)
      requestMock.mockResolvedValue(mockUndiciResponse(200));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        checkIntervalMs: 60_000, // check every minute
        prolongedDowntimeMinutes: 5,
      });
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // All subsequent checks: DOWN
      requestMock.mockResolvedValue(mockUndiciResponse(500));

      // Advance through 6 checks (6 minutes total), enough to exceed prolongedDowntimeMinutes
      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(60_000);
      }

      const alerts = monitor.getRecentAlerts();
      const prolongedAlerts = alerts.filter((a) => a.type === "PROLONGED_DOWNTIME");
      expect(prolongedAlerts.length).toBeGreaterThanOrEqual(1);
      expect(prolongedAlerts[0]!.severity).toBe("critical");

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 15. Service restart detection
  // -------------------------------------------------------------------------

  describe("service restart detection", () => {
    it("generates SERVICE_RESTARTED alert when uptime drops", async () => {
      // First check: service has high uptime
      requestMock.mockResolvedValue(
        mockUndiciResponse(200, { uptime: 86400, status: "ok" }),
      );

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Second check: uptime is lower (service restarted)
      requestMock.mockResolvedValue(
        mockUndiciResponse(200, { uptime: 5, status: "ok" }),
      );
      await vi.advanceTimersByTimeAsync(15_000);

      const alerts = monitor.getRecentAlerts();
      const restartAlerts = alerts.filter((a) => a.type === "SERVICE_RESTARTED");
      expect(restartAlerts.length).toBeGreaterThanOrEqual(1);
      expect(restartAlerts[0]!.severity).toBe("warning");

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 16. HIGH_RESPONSE_TIME alert
  // -------------------------------------------------------------------------

  describe("high response time alert", () => {
    it("generates HIGH_RESPONSE_TIME alert when response exceeds threshold", async () => {
      // Use real timers for this test since we need accurate performance.now()
      vi.useRealTimers();

      // Mock request to take >50ms by introducing a small delay
      requestMock.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 60));
        return mockUndiciResponse(200, { status: "ok" });
      });

      // Set a very low threshold (10ms) so the 60ms delay exceeds it
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES, {
        responseTimeThresholdMs: 10,
        checkIntervalMs: 60_000, // long interval to prevent re-checks
      });
      monitor.start();

      // Wait for the immediate check to complete
      await new Promise((r) => setTimeout(r, 200));

      const alerts = monitor.getRecentAlerts();
      const highRtAlerts = alerts.filter((a) => a.type === "HIGH_RESPONSE_TIME");
      expect(highRtAlerts.length).toBeGreaterThanOrEqual(1);
      expect(highRtAlerts[0]!.severity).toBe("warning");

      monitor.stop();

      // Restore fake timers for remaining tests
      vi.useFakeTimers();
    });
  });

  // -------------------------------------------------------------------------
  // 17. processCheckResult handles rejected promises
  // -------------------------------------------------------------------------

  describe("rejected check promises", () => {
    it("handles Promise.allSettled rejected entries as DOWN", async () => {
      // One service resolves, other rejects at the Promise.allSettled level
      requestMock
        .mockResolvedValueOnce(mockUndiciResponse(200))
        .mockRejectedValueOnce(new Error("DNS lookup failed"));

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("UP");
      expect(monitor.getServiceStatus("svc-b")!.currentStatus).toBe("DOWN");

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 18. Non-JSON response body handling
  // -------------------------------------------------------------------------

  describe("non-JSON response body", () => {
    it("handles response body that is not valid JSON", async () => {
      const response = {
        statusCode: 200,
        body: {
          json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
          dump: vi.fn().mockResolvedValue(undefined),
        },
      };
      requestMock.mockResolvedValue(response);

      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Should still mark as UP, just no metadata
      expect(monitor.getServiceStatus("svc-a")!.currentStatus).toBe("UP");
      expect(response.body.dump).toHaveBeenCalled();

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 19. downSince cleared on recovery
  // -------------------------------------------------------------------------

  describe("downSince tracking", () => {
    it("sets downSince when service goes DOWN and clears it on recovery", async () => {
      // Check 1: UP
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.downSince).toBeNull();

      // Check 2: DOWN
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      expect(monitor.getServiceStatus("svc-a")!.downSince).not.toBeNull();

      // Check 3: UP (recovery)
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      await vi.advanceTimersByTimeAsync(15_000);

      expect(monitor.getServiceStatus("svc-a")!.downSince).toBeNull();

      monitor.stop();
    });
  });

  // -------------------------------------------------------------------------
  // 20. lastStatusChange tracking
  // -------------------------------------------------------------------------

  describe("lastStatusChange tracking", () => {
    it("updates lastStatusChange on status transitions (non-UNKNOWN)", async () => {
      // Check 1: UP (from UNKNOWN -- should NOT set lastStatusChange per source code)
      requestMock.mockResolvedValue(mockUndiciResponse(200));
      const monitor = new HealthMonitor(db, redis, TEST_SERVICES);
      monitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getServiceStatus("svc-a")!.lastStatusChange).toBeNull();

      // Check 2: DOWN (from UP -- should set lastStatusChange)
      requestMock.mockResolvedValue(mockUndiciResponse(500));
      await vi.advanceTimersByTimeAsync(15_000);

      const health = monitor.getServiceStatus("svc-a")!;
      expect(health.lastStatusChange).not.toBeNull();
      expect(typeof health.lastStatusChange).toBe("string");

      monitor.stop();
    });
  });
});
