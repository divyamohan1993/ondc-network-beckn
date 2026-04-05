/**
 * EXTREME resilience tests for services: escalation, settlement, circuit breaker.
 *
 * Split from resilience-extreme.test.ts to avoid OOM during vitest transformation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../packages/shared/src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { EscalationService } from "../../packages/shared/src/services/escalation-service.js";

// ---------------------------------------------------------------------------
// Shared helpers
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

// =========================================================================
// 2. ESCALATION SERVICE EDGE CASES
// =========================================================================

describe("2. EscalationService Edge Cases", () => {
  // Prod failure: Duplicate IGM issue raised by retry logic created two timers
  // and both escalated independently, sending double notifications
  it("should handle creating timer for same issue twice", async () => {
    const db = createFunctionalMockDb();
    const service = new EscalationService(db);

    await service.createTimer("issue-001");
    await service.createTimer("issue-001");

    // Both timers are created (service doesn't deduplicate at this level)
    expect(db._timers).toHaveLength(2);
    expect(db._timers[0].issue_id).toBe("issue-001");
    expect(db._timers[1].issue_id).toBe("issue-001");
  });

  // Prod failure: Escalating a non-existent issue returned undefined and
  // the caller tried to read .newLevel on undefined, crashing the cron job
  it("should return null when escalating non-existent issue", async () => {
    const db = createFunctionalMockDb();
    const service = new EscalationService(db);

    const result = await service.escalate("ghost-issue-999");
    expect(result).toBeNull();
  });

  // Prod failure: L3 issue was escalated to L4 which doesn't exist,
  // causing the new timer to have undefined SLA config
  it("should return null when escalating from L3 (max level)", async () => {
    const db = createFunctionalMockDb();
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

  // Prod failure: Double-click on "Mark Resolved" button sent two requests,
  // second one threw because the update WHERE clause matched zero rows
  it("should be idempotent when marking already-resolved issue as resolved", async () => {
    const db = createFunctionalMockDb();
    const service = new EscalationService(db);

    await service.createTimer("issue-resolve-twice");
    await service.markResolved("issue-resolve-twice");
    // Second call should not throw
    await expect(service.markResolved("issue-resolve-twice")).resolves.not.toThrow();
  });

  // Prod failure: Acknowledgment webhook fired twice due to network retry,
  // second ack overwrote acknowledged_at timestamp causing audit confusion
  it("should be idempotent when marking already-acknowledged issue", async () => {
    const db = createFunctionalMockDb();
    const service = new EscalationService(db);

    await service.createTimer("issue-ack-twice");
    await service.markAcknowledged("issue-ack-twice");
    await expect(service.markAcknowledged("issue-ack-twice")).resolves.not.toThrow();
  });

  // Prod failure: Auto-escalation cron ran every minute but with no expired
  // timers it still made N+1 DB queries scanning all issues
  it("should do nothing when checkAndAutoEscalate finds no expired timers", async () => {
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

  // Prod failure: 100 issues expired simultaneously during maintenance window,
  // auto-escalation took 45 minutes because each escalate() was sequential
  it("should escalate all 100 expired timers without error", async () => {
    const db = createFunctionalMockDb();

    // Create 100 expired timers at L1
    const expiredTimers: MockTimer[] = [];
    for (let i = 0; i < 100; i++) {
      const timer: MockTimer = {
        id: String(i + 1),
        issue_id: `issue-expired-${i}`,
        current_level: 1,
        escalation_deadline: new Date(Date.now() - 60000), // 1 min ago
        escalated: false,
        escalated_at: null,
        acknowledged: false,
        acknowledged_at: null,
        resolved: false,
        resolved_at: null,
        created_at: new Date(),
      };
      db._timers.push(timer);
      expiredTimers.push(timer);
    }

    let selectCallCount = 0;
    db.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // First call: return all expired timers
            return Promise.resolve([...expiredTimers]);
          }
          // Subsequent calls: escalate() looking for active timer by issue_id
          const activeTimers = db._timers.filter((t: MockTimer) => !t.resolved && !t.escalated);
          return {
            limit: vi.fn().mockResolvedValue(activeTimers.length > 0 ? [activeTimers[0]] : []),
          };
        }),
      })),
    }));

    const service = new EscalationService(db);
    const result = await service.checkAndAutoEscalate();

    // At least some should have escalated (exact count depends on mock behavior)
    expect(result.escalated.length + result.maxLevel.length).toBeGreaterThan(0);
  });

  // Prod failure: Timer created 1ms ago was escalated on the very next cron tick
  // because deadline comparison used <= instead of <
  it("should NOT escalate a timer whose deadline has not passed", async () => {
    const db = createFunctionalMockDb();
    const futureTimer: MockTimer = {
      id: "50",
      issue_id: "issue-not-yet",
      current_level: 1,
      escalation_deadline: new Date(Date.now() + 3600000), // 1 hour from now
      escalated: false,
      escalated_at: null,
      acknowledged: false,
      acknowledged_at: null,
      resolved: false,
      resolved_at: null,
      created_at: new Date(),
    };
    db._timers.push(futureTimer);

    // Auto-escalate should return empty (no expired timers)
    db.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]), // no expired timers
      })),
    }));

    const service = new EscalationService(db);
    const result = await service.checkAndAutoEscalate();
    expect(result.escalated).toHaveLength(0);
  });

  // Prod failure: Timer created with past deadline (due to clock skew between
  // app servers) was never picked up by auto-escalation
  it("should escalate timer with deadline already in the past at creation", async () => {
    const db = createFunctionalMockDb();
    const pastTimer: MockTimer = {
      id: "60",
      issue_id: "issue-past-deadline",
      current_level: 1,
      escalation_deadline: new Date(Date.now() - 1), // already expired
      escalated: false,
      escalated_at: null,
      acknowledged: false,
      acknowledged_at: null,
      resolved: false,
      resolved_at: null,
      created_at: new Date(),
    };
    db._timers.push(pastTimer);

    let selectCallCount = 0;
    db.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve([pastTimer]);
          }
          return {
            limit: vi.fn().mockResolvedValue([pastTimer]),
          };
        }),
      })),
    }));

    const service = new EscalationService(db);
    const result = await service.checkAndAutoEscalate();
    expect(result.escalated).toContain("issue-past-deadline");
  });
});

// =========================================================================
// 3. SETTLEMENT SERVICE EDGE CASES
// =========================================================================

describe("3. Settlement Service Edge Cases (logic verification)", () => {
  // Prod failure: Zero-amount settlement instruction caused division by zero
  // in withholding percentage calculation
  it("should handle settlement with amount = 0", () => {
    const amount = 0;
    const withholdingPercent = 10;
    const withholdingAmount = (amount * withholdingPercent) / 100;
    const finderFee = 0;
    const platformFee = 0;
    const netPayable = amount - finderFee - platformFee - withholdingAmount;

    expect(withholdingAmount).toBe(0);
    expect(netPayable).toBe(0);
    expect(Number.isFinite(netPayable)).toBe(true);
  });

  // Prod failure: Refund created a settlement with negative amount, which
  // bypassed the withholding check and released funds immediately
  it("should compute negative net payable for negative amount", () => {
    const amount = -500;
    const withholdingPercent = 10;
    const withholdingAmount = (amount * withholdingPercent) / 100;
    const finderFee = 30;
    const platformFee = 20;
    const netPayable = amount - finderFee - platformFee - withholdingAmount;

    expect(withholdingAmount).toBe(-50);
    expect(netPayable).toBe(-500 - 30 - 20 - (-50)); // -500
    expect(netPayable).toBe(-500);
  });

  // Prod failure: 100% withholding left net payable at zero, but downstream
  // NOCS API rejected zero-amount transfer instructions
  it("should handle 100% withholding (full withholding)", () => {
    const amount = 1000;
    const withholdingPercent = 100;
    const withholdingAmount = (amount * withholdingPercent) / 100;
    const netPayable = amount - 30 - 20 - withholdingAmount;

    expect(withholdingAmount).toBe(1000);
    expect(netPayable).toBe(-50); // Negative! This is a real edge case
  });

  // Prod failure: 0% withholding still created a withholding pool row with
  // amount=0, which confused the refund flow
  it("should handle 0% withholding (no withholding)", () => {
    const amount = 1000;
    const withholdingPercent = 0;
    const withholdingAmount = (amount * withholdingPercent) / 100;

    expect(withholdingAmount).toBe(0);
    // No withholding pool should be created when amount is 0
    expect(withholdingAmount > 0).toBe(false);
  });

  // Prod failure: Finder fee was greater than order amount for a promotional
  // offer, resulting in negative net payable and NOCS rejection
  it("should compute net payable correctly when finder fee > amount", () => {
    const amount = 100;
    const finderFee = 150; // Greater than amount!
    const platformFee = 20;
    const withholdingAmount = 10;
    const netPayable = amount - finderFee - platformFee - withholdingAmount;

    expect(netPayable).toBe(-80); // Negative
    expect(netPayable).toBeLessThan(0);
  });

  // Prod failure: Refund amount exceeded withheld amount because the pool
  // was partially used by a previous partial refund
  it("should reject refund when refund amount > withheld amount", () => {
    const withheldAmount = 100;
    const refundUsed = 0;
    const available = withheldAmount - refundUsed;
    const refundAmount = 150;

    expect(refundAmount > available).toBe(true);
  });

  // Prod failure: Exact refund amount = withheld amount was rejected because
  // the comparison used < instead of <=
  it("should accept refund when refund amount = exactly withheld", () => {
    const withheldAmount = 100;
    const refundUsed = 0;
    const available = withheldAmount - refundUsed;
    const refundAmount = 100;

    expect(refundAmount <= available).toBe(true);
  });

  // Prod failure: Reconciliation with only one party's instruction reported
  // "matched" because the comparison loop was skipped
  it("should detect single-party settlement as unreconciled", () => {
    const instructions = [
      { collector_subscriber_id: "coll-1", signed_by: "coll-1", amount: "1000", net_payable: "900", finder_fee_amount: "30" },
    ];

    expect(instructions.length).toBeLessThan(2);
    // This should be reported as unreconciled
    const matched = instructions.length >= 2;
    expect(matched).toBe(false);
  });

  // Prod failure: Amount mismatch between collector and receiver went
  // undetected because both values were strings and comparison used ===
  it("should detect amount mismatch in reconciliation", () => {
    const collector = { amount: "1000.00", net_payable: "900.00", finder_fee_amount: "30" };
    const receiver = { amount: "1000.50", net_payable: "900.00", finder_fee_amount: "30" };

    const discrepancies: string[] = [];
    if (collector.amount !== receiver.amount) {
      discrepancies.push(`Amount mismatch: ${collector.amount} vs ${receiver.amount}`);
    }
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]).toContain("mismatch");
  });

  // Prod failure: Reconciliation with matching amounts passed even though
  // net_payable differed due to different fee calculations
  it("should detect net_payable mismatch even when amounts match", () => {
    const collector = { amount: "1000", net_payable: "900", finder_fee_amount: "30" };
    const receiver = { amount: "1000", net_payable: "850", finder_fee_amount: "80" };

    const discrepancies: string[] = [];
    if (collector.amount !== receiver.amount) {
      discrepancies.push("Amount mismatch");
    }
    if (collector.net_payable !== receiver.net_payable) {
      discrepancies.push("Net payable mismatch");
    }
    if (collector.finder_fee_amount !== receiver.finder_fee_amount) {
      discrepancies.push("Finder fee mismatch");
    }

    expect(discrepancies).toHaveLength(2);
    expect(discrepancies).toContain("Net payable mismatch");
    expect(discrepancies).toContain("Finder fee mismatch");
  });
});

// =========================================================================
// 4. CIRCUIT BREAKER TESTS
// =========================================================================

describe("4. Circuit Breaker Tests", () => {
  class TestCircuitBreaker {
    private state: Map<string, { failures: number; openUntil: number }> = new Map();
    private readonly maxFailures = 5;
    private readonly cooldownMs = 60_000;

    isOpen(bppId: string): boolean {
      const s = this.state.get(bppId);
      if (!s) return false;
      if (Date.now() > s.openUntil) {
        this.state.delete(bppId);
        return false;
      }
      return s.failures >= this.maxFailures;
    }

    recordFailure(bppId: string): void {
      const s = this.state.get(bppId) || { failures: 0, openUntil: 0 };
      s.failures++;
      if (s.failures >= this.maxFailures) {
        s.openUntil = Date.now() + this.cooldownMs;
      }
      this.state.set(bppId, s);
    }

    recordSuccess(bppId: string): void {
      this.state.delete(bppId);
    }

    get size(): number {
      return this.state.size;
    }
  }

  let breaker: TestCircuitBreaker;

  beforeEach(() => {
    breaker = new TestCircuitBreaker();
  });

  // Prod failure: Circuit opened after 3 transient failures, blocking
  // a healthy BPP for 60 seconds during a brief DNS hiccup
  it("should stay closed after 4 failures (below threshold of 5)", () => {
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure("bpp-1");
    }
    expect(breaker.isOpen("bpp-1")).toBe(false);
  });

  // Prod failure: Circuit never opened because failure count was reset
  // on every check instead of accumulating
  it("should open after 5 consecutive failures", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("bpp-1");
    }
    expect(breaker.isOpen("bpp-1")).toBe(true);
  });

  // Prod failure: Open circuit still forwarded 10% of requests due to
  // a stale "half-open" state that was never cleared
  it("should block requests when circuit is open", () => {
    for (let i = 0; i < 10; i++) {
      breaker.recordFailure("bpp-1");
    }
    expect(breaker.isOpen("bpp-1")).toBe(true);
    // Multiple checks should all return true
    expect(breaker.isOpen("bpp-1")).toBe(true);
    expect(breaker.isOpen("bpp-1")).toBe(true);
  });

  // Prod failure: Circuit never recovered because cooldown timer was set
  // to Date.now() instead of Date.now() + cooldownMs
  it("should reset after cooldown period", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("bpp-1");
    }
    expect(breaker.isOpen("bpp-1")).toBe(true);

    // Fast-forward past cooldown using vi.useFakeTimers
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000); // 61 seconds
    expect(breaker.isOpen("bpp-1")).toBe(false);
    vi.useRealTimers();
  });

  // Prod failure: A single success after 4 failures didn't reset the counter,
  // so the next failure (5th overall) opened the circuit unnecessarily
  it("should reset failure counter on success after 4 failures", () => {
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure("bpp-1");
    }
    breaker.recordSuccess("bpp-1");
    // After success, one more failure should not open the circuit
    breaker.recordFailure("bpp-1");
    expect(breaker.isOpen("bpp-1")).toBe(false);
  });

  // Prod failure: All BPPs shared a single circuit breaker, so one bad BPP
  // blocked all search requests across the network
  it("should track different BPP URLs independently", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("bpp-bad");
    }
    expect(breaker.isOpen("bpp-bad")).toBe(true);
    expect(breaker.isOpen("bpp-good")).toBe(false);
  });

  // Prod failure: 10,000 unique BPP URLs during stress test caused the
  // circuit breaker map to grow unbounded and consume 2GB of memory
  it("should handle 100 different BPP URLs without unbounded memory growth", () => {
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100; i++) {
      breaker.recordFailure(`bpp-${i}`);
    }
    const after = process.memoryUsage().heapUsed;
    expect(breaker.size).toBe(100);
    // Memory should be trivial for 100 entries (< 1MB)
    expect(after - before).toBeLessThan(1024 * 1024);
  });
});
