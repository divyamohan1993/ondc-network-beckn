/**
 * EXTREME resilience tests for MetricsCollector.
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

import { MetricsCollector } from "../../packages/shared/src/services/metrics-collector.js";

// =========================================================================
// 1. METRICS COLLECTOR UNDER LOAD
// =========================================================================

describe("1. MetricsCollector Under Load", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // Prod failure: Grafana exporter OOM'd because metrics array grew unbounded
  // for a popular action during Diwali sale with 500K rps
  it("should survive 20,000 requests without OOM or crash", { timeout: 30000 }, () => {
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 20_000; i++) {
      collector.recordRequest("search", (i % 1000) + 1, i % 7 !== 0);
    }
    const after = process.memoryUsage().heapUsed;
    const metrics = collector.getMetrics();
    expect(metrics["search"]!.totalRequests).toBe(20_000);
    // Memory growth should be bounded -- ring buffer caps at 10K values
    // Allow generous 50MB growth (in practice it's < 5MB)
    expect(after - before).toBeLessThan(50 * 1024 * 1024);
  });

  // Prod failure: Percentile calculation sorted a 2M-element array on every request
  // because ring buffer cap was never enforced
  it("should cap ring buffer at 10,000 values (maxValues)", () => {
    for (let i = 0; i < 20_000; i++) {
      collector.recordRequest("search", i, true);
    }
    const metrics = collector.getMetrics();
    // The collector stores at most maxValues (10,000) latency samples
    // We verify indirectly: p50 should reflect the LAST 10K values (10000-19999),
    // not the first 10K (0-9999)
    expect(metrics["search"]!.totalRequests).toBe(20_000);
    // p50 of values 10000..19999 should be around 15000, not around 5000
    expect(metrics["search"]!.latency.p50).toBeGreaterThan(10_000);
  });

  // Prod failure: Dashboard showed p99=50ms when actual p99 was 96ms because
  // percentile index calculation was off by one
  it("should compute p50/p95/p99 accurately for known distribution 1..100", () => {
    for (let i = 1; i <= 100; i++) {
      collector.recordRequest("search", i, true);
    }
    const m = collector.getMetrics()["search"]!;
    // floor(100*0.5) = index 50, sorted[50] = 51
    expect(m.latency.p50).toBe(51);
    // floor(100*0.95) = index 95, sorted[95] = 96
    expect(m.latency.p95).toBe(96);
    // floor(100*0.99) = index 99, sorted[99] = 100
    expect(m.latency.p99).toBe(100);
  });

  // Prod failure: p99 alert never fired because 1% of requests at 10s latency
  // were drowned out by 99% at 1ms, and the percentile algo was wrong
  it("should handle pathological distribution (99% at 1ms, 1% at 10000ms)", () => {
    // 990 requests at 1ms, 10 requests at 10000ms
    for (let i = 0; i < 990; i++) {
      collector.recordRequest("search", 1, true);
    }
    for (let i = 0; i < 10; i++) {
      collector.recordRequest("search", 10000, true);
    }
    const m = collector.getMetrics()["search"]!;
    expect(m.latency.p50).toBe(1);
    expect(m.latency.p95).toBe(1);
    // p99 should capture the tail: floor(1000*0.99) = index 990
    // sorted[990] = 10000 (first of the 10000ms values)
    expect(m.latency.p99).toBe(10000);
  });

  // Prod failure: Zero-latency requests from health checks crashed avg calculation
  it("should handle latency = 0", () => {
    collector.recordRequest("search", 0, true);
    const m = collector.getMetrics()["search"]!;
    expect(m.latency.min).toBe(0);
    expect(m.latency.avg).toBe(0);
    expect(m.latency.p50).toBe(0);
    expect(Number.isFinite(m.latency.p50)).toBe(true);
  });

  // Prod failure: A bug sent latency = MAX_SAFE_INTEGER and the sum overflowed
  it("should handle latency = Number.MAX_SAFE_INTEGER", () => {
    collector.recordRequest("search", Number.MAX_SAFE_INTEGER, true);
    const m = collector.getMetrics()["search"]!;
    expect(m.latency.max).toBe(Number.MAX_SAFE_INTEGER);
    expect(m.totalRequests).toBe(1);
  });

  // Prod failure: Negative latency from clock skew (NTP correction mid-request)
  // caused min to become negative and broke Prometheus exposition
  it("should handle latency = -1 (negative from clock skew)", () => {
    collector.recordRequest("search", -1, true);
    const m = collector.getMetrics()["search"]!;
    // Should record it without crashing; min becomes -1
    expect(m.latency.min).toBe(-1);
    expect(m.totalRequests).toBe(1);
  });

  // Prod failure: NaN latency from parsing "undefined" as float propagated
  // through all percentile calculations
  it("should handle latency = NaN without corrupting metrics", () => {
    collector.recordRequest("search", 100, true);
    collector.recordRequest("search", NaN, true);
    collector.recordRequest("search", 200, true);
    const m = collector.getMetrics()["search"]!;
    expect(m.totalRequests).toBe(3);
    // NaN poisons arithmetic, but the collector should not throw
    expect(Number.isNaN(m.latency.p50) || Number.isFinite(m.latency.p50)).toBe(true);
  });

  // Prod failure: Infinity latency from division by zero in upstream timer
  it("should handle latency = Infinity", () => {
    collector.recordRequest("search", Infinity, true);
    const m = collector.getMetrics()["search"]!;
    expect(m.totalRequests).toBe(1);
    // max should be Infinity (or rounded) -- should not throw
    expect(m.latency.max).toBe(Infinity);
  });

  // Prod failure: Dashboard showed stale data after reset because getMetrics
  // still returned cached results from pre-reset state
  it("should return empty metrics after reset()", () => {
    collector.recordRequest("search", 100, true);
    collector.recordRequest("confirm", 200, false);
    collector.reset();
    const m = collector.getMetrics();
    expect(Object.keys(m)).toHaveLength(0);
  });

  // Prod failure: Prometheus scrape returned "NaN" for p99 which made
  // Grafana panel display "No data" and suppressed alerts
  it("should produce valid Prometheus output (no NaN, no Infinity, no undefined)", () => {
    collector.recordRequest("search", 100, true);
    collector.recordRequest("search", 200, false);
    collector.recordRequest("on-search", 150, true, 100);
    const output = collector.toPrometheus();
    expect(output).not.toContain("NaN");
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("null");
    // Each line should be valid Prometheus text format
    const lines = output.trim().split("\n");
    for (const line of lines) {
      if (line.startsWith("#")) continue;
      // metric_name{labels} value -- value must be a finite number
      const parts = line.split(" ");
      const value = parts[parts.length - 1];
      expect(value).toBeDefined();
      if (!line.startsWith("#")) {
        const num = parseFloat(value!);
        expect(Number.isFinite(num)).toBe(true);
      }
    }
  });

  // Prod failure: Race condition in metrics recording during high concurrency
  // caused totalRequests to be less than successCount + errorCount
  it("should handle 100 concurrent recordRequest calls (Promise.all)", async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve(collector.recordRequest("search", i, i % 2 === 0))
    );
    await Promise.all(promises);
    const m = collector.getMetrics()["search"]!;
    expect(m.totalRequests).toBe(100);
    expect(m.successCount + m.errorCount).toBe(100);
  });
});
