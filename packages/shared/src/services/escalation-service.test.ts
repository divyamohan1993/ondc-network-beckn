import { describe, it, expect, vi, beforeEach } from "vitest";
import { EscalationService } from "./escalation-service.js";

// ---------------------------------------------------------------------------
// Mock logger to prevent console noise during tests
// ---------------------------------------------------------------------------
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------

interface MockTimer {
  id: string;
  issue_id: string;
  current_level: number;
  escalation_deadline: Date;
  escalated: boolean;
  escalated_at: Date | null;
  acknowledged: boolean;
  acknowledged_at: Date | null;
  resolved: boolean;
  resolved_at: Date | null;
  created_at: Date;
}

function createMockDb() {
  const timers: MockTimer[] = [];
  let nextId = 1;

  // Build a chainable mock that mimics drizzle's query builder
  const db: any = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((row: any) => {
        timers.push({
          id: String(nextId++),
          issue_id: row.issue_id,
          current_level: row.current_level ?? 1,
          escalation_deadline: row.escalation_deadline,
          escalated: false,
          escalated_at: null,
          acknowledged: false,
          acknowledged_at: null,
          resolved: false,
          resolved_at: null,
          created_at: new Date(),
        });
        return Promise.resolve();
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition: any) => {
          // The mock just resolves; actual filtering happens in _applyUpdate
          return Promise.resolve();
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation((n: number) => {
            // Return matching timers - will be set up per test
            return Promise.resolve([]);
          }),
          orderBy: vi.fn().mockImplementation(() => {
            return Promise.resolve([]);
          }),
        }),
      }),
    }),
    _timers: timers,
    _nextId: () => nextId,
  };

  return db;
}

/**
 * Create a more functional mock DB that actually stores and queries timers.
 */
function createFunctionalMockDb() {
  const timers: MockTimer[] = [];
  let nextId = 1;

  const db: any = {
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: any) => {
        timers.push({
          id: String(nextId++),
          issue_id: row.issue_id,
          current_level: row.current_level ?? 1,
          escalation_deadline: row.escalation_deadline,
          escalated: false,
          escalated_at: null,
          acknowledged: false,
          acknowledged_at: null,
          resolved: false,
          resolved_at: null,
          created_at: new Date(),
        });
        return Promise.resolve();
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((updates: any) => ({
        where: vi.fn().mockImplementation(() => {
          // Find matching timers and apply updates
          // Simple: apply to last matching unresolved timer
          for (const timer of timers) {
            if (!timer.resolved && !timer.escalated) {
              if (updates.acknowledged !== undefined) timer.acknowledged = updates.acknowledged;
              if (updates.acknowledged_at !== undefined) timer.acknowledged_at = updates.acknowledged_at;
              if (updates.resolved !== undefined) timer.resolved = updates.resolved;
              if (updates.resolved_at !== undefined) timer.resolved_at = updates.resolved_at;
              if (updates.escalated !== undefined) timer.escalated = updates.escalated;
              if (updates.escalated_at !== undefined) timer.escalated_at = updates.escalated_at;
              break;
            }
          }
          return Promise.resolve();
        }),
      })),
    })),
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(() => {
            const active = timers.filter((t) => !t.resolved && !t.escalated);
            return Promise.resolve(active.slice(0, 1));
          }),
          orderBy: vi.fn().mockImplementation(() => {
            return Promise.resolve([...timers]);
          }),
        })),
      })),
    })),
    _timers: timers,
  };

  return db;
}

// ---------------------------------------------------------------------------
// EscalationService
// ---------------------------------------------------------------------------

describe("EscalationService", () => {
  // -------------------------------------------------------------------------
  // createTimer
  // -------------------------------------------------------------------------

  describe("createTimer", () => {
    it("should create a level 1 escalation entry", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-001");

      expect(db._timers).toHaveLength(1);
      expect(db._timers[0].issue_id).toBe("issue-001");
      expect(db._timers[0].current_level).toBe(1);
    });

    it("should set an escalation deadline in the future", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);
      const before = new Date();

      await service.createTimer("issue-002");

      const timer = db._timers[0];
      expect(timer.escalation_deadline.getTime()).toBeGreaterThan(before.getTime());
    });

    it("should call db.insert", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-003");

      expect(db.insert).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // markAcknowledged
  // -------------------------------------------------------------------------

  describe("markAcknowledged", () => {
    it("should call db.update", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-ack");
      await service.markAcknowledged("issue-ack");

      expect(db.update).toHaveBeenCalled();
    });

    it("should update the timer to acknowledged", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-ack-2");
      await service.markAcknowledged("issue-ack-2");

      expect(db._timers[0].acknowledged).toBe(true);
      expect(db._timers[0].acknowledged_at).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // markResolved
  // -------------------------------------------------------------------------

  describe("markResolved", () => {
    it("should call db.update to mark resolved", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-resolve");
      await service.markResolved("issue-resolve");

      expect(db.update).toHaveBeenCalled();
    });

    it("should set resolved flag and timestamp", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-resolve-2");
      await service.markResolved("issue-resolve-2");

      expect(db._timers[0].resolved).toBe(true);
      expect(db._timers[0].resolved_at).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // escalate
  // -------------------------------------------------------------------------

  describe("escalate", () => {
    it("should move from L1 to L2", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-esc-1");
      const result = await service.escalate("issue-esc-1");

      expect(result).not.toBeNull();
      expect(result!.newLevel).toBe(2);
      expect(result!.deadline).toBeInstanceOf(Date);
    });

    it("should create a new timer at the next level", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-esc-2");
      await service.escalate("issue-esc-2");

      // Should have 2 timers: original (escalated) and new (level 2)
      expect(db._timers).toHaveLength(2);
      expect(db._timers[1].current_level).toBe(2);
    });

    it("should mark the original timer as escalated", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      await service.createTimer("issue-esc-3");
      await service.escalate("issue-esc-3");

      expect(db._timers[0].escalated).toBe(true);
    });

    it("should return null when no active timer found", async () => {
      const db = createFunctionalMockDb();
      const service = new EscalationService(db);

      // No timer created, select returns empty
      const result = await service.escalate("nonexistent-issue");
      expect(result).toBeNull();
    });

    it("should return null when already at L3", async () => {
      // Create a mock DB that returns a level-3 timer from select
      const db = createFunctionalMockDb();
      // Manually push a level 3 timer
      db._timers.push({
        id: "99",
        issue_id: "issue-at-l3",
        current_level: 3,
        escalation_deadline: new Date(Date.now() + 86400000),
        escalated: false,
        escalated_at: null,
        acknowledged: false,
        acknowledged_at: null,
        resolved: false,
        resolved_at: null,
        created_at: new Date(),
      });

      const service = new EscalationService(db);
      const result = await service.escalate("issue-at-l3");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // checkAndAutoEscalate
  // -------------------------------------------------------------------------

  describe("checkAndAutoEscalate", () => {
    it("should find expired timers and return escalated list", async () => {
      // Create a DB that returns expired timers from select
      const expiredTimer: MockTimer = {
        id: "10",
        issue_id: "issue-expired",
        current_level: 1,
        escalation_deadline: new Date(Date.now() - 1000), // expired
        escalated: false,
        escalated_at: null,
        acknowledged: false,
        acknowledged_at: null,
        resolved: false,
        resolved_at: null,
        created_at: new Date(),
      };

      const db = createFunctionalMockDb();
      db._timers.push(expiredTimer);

      // Override select to return expired timers for the auto-escalate query
      // and active timers for the escalate query
      let selectCallCount = 0;
      db.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // First call is checkAndAutoEscalate looking for expired timers
              return Promise.resolve([expiredTimer]);
            }
            // Second call is escalate looking for active timer
            return {
              limit: vi.fn().mockResolvedValue([expiredTimer]),
            };
          }),
        })),
      }));

      const service = new EscalationService(db);
      const result = await service.checkAndAutoEscalate();

      expect(result.escalated).toContain("issue-expired");
    });

    it("should report max-level timers separately", async () => {
      const maxLevelTimer: MockTimer = {
        id: "20",
        issue_id: "issue-max-level",
        current_level: 3,
        escalation_deadline: new Date(Date.now() - 1000),
        escalated: false,
        escalated_at: null,
        acknowledged: false,
        acknowledged_at: null,
        resolved: false,
        resolved_at: null,
        created_at: new Date(),
      };

      const db = createFunctionalMockDb();

      db.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([maxLevelTimer]),
        })),
      }));

      const service = new EscalationService(db);
      const result = await service.checkAndAutoEscalate();

      expect(result.maxLevel).toContain("issue-max-level");
      expect(result.escalated).toHaveLength(0);
    });

    it("should return empty arrays when no expired timers", async () => {
      const db = createFunctionalMockDb();
      db.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }));

      const service = new EscalationService(db);
      const result = await service.checkAndAutoEscalate();

      expect(result.escalated).toHaveLength(0);
      expect(result.maxLevel).toHaveLength(0);
    });
  });
});
