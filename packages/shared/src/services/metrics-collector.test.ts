import { describe, it, expect, beforeEach, vi } from "vitest";
import { MetricsCollector } from "./metrics-collector.js";

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
// MetricsCollector
// ---------------------------------------------------------------------------

describe("MetricsCollector", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // -------------------------------------------------------------------------
  // recordRequest
  // -------------------------------------------------------------------------

  describe("recordRequest", () => {
    it("should increment totalRequests", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 200, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.totalRequests).toBe(2);
    });

    it("should increment successCount for successful requests", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 100, false);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.successCount).toBe(2);
    });

    it("should increment errorCount for failed requests", () => {
      collector.recordRequest("search", 100, false);
      collector.recordRequest("search", 100, false);
      collector.recordRequest("search", 100, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.errorCount).toBe(2);
    });

    it("should track SLA violations when latency exceeds threshold", () => {
      collector.recordRequest("search", 500, true, 200);
      collector.recordRequest("search", 100, true, 200);
      collector.recordRequest("search", 300, true, 200);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.slaViolations).toBe(2);
    });

    it("should not track SLA violations when no slaMs provided", () => {
      collector.recordRequest("search", 5000, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.slaViolations).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Latency percentiles
  // -------------------------------------------------------------------------

  describe("latency percentiles", () => {
    it("should calculate p50 correctly", () => {
      // Add 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest("search", i, true);
      }
      const metrics = collector.getMetrics();
      // floor(100 * 0.5) = index 50, value at sorted[50] = 51
      expect(metrics["search"]!.latency.p50).toBe(51);
    });

    it("should calculate p95 correctly", () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest("search", i, true);
      }
      const metrics = collector.getMetrics();
      // floor(100 * 0.95) = index 95, value at sorted[95] = 96
      expect(metrics["search"]!.latency.p95).toBe(96);
    });

    it("should calculate p99 correctly", () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest("search", i, true);
      }
      const metrics = collector.getMetrics();
      // floor(100 * 0.99) = index 99, value at sorted[99] = 100
      expect(metrics["search"]!.latency.p99).toBe(100);
    });

    it("should track min and max latency", () => {
      collector.recordRequest("search", 50, true);
      collector.recordRequest("search", 10, true);
      collector.recordRequest("search", 200, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.latency.min).toBe(10);
      expect(metrics["search"]!.latency.max).toBe(200);
    });

    it("should calculate average latency", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 200, true);
      collector.recordRequest("search", 300, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.latency.avg).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // getMetrics structure
  // -------------------------------------------------------------------------

  describe("getMetrics", () => {
    it("should return correct errorRate", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 100, false);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.errorRate).toBe(0.5);
    });

    it("should return errorRate 0 when all succeed", () => {
      collector.recordRequest("search", 100, true);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.errorRate).toBe(0);
    });

    it("should return correct slaComplianceRate", () => {
      collector.recordRequest("search", 100, true, 200); // within SLA
      collector.recordRequest("search", 300, true, 200); // violates SLA
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.slaComplianceRate).toBe(0.5);
    });

    it("should return slaComplianceRate 1 when no violations", () => {
      collector.recordRequest("search", 100, true, 200);
      const metrics = collector.getMetrics();
      expect(metrics["search"]!.slaComplianceRate).toBe(1);
    });

    it("should return empty object when no metrics recorded", () => {
      const metrics = collector.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // toPrometheus
  // -------------------------------------------------------------------------

  describe("toPrometheus", () => {
    it("should output valid Prometheus text format", () => {
      collector.recordRequest("search", 100, true);
      const output = collector.toPrometheus();
      expect(output).toContain("# HELP ondc_uptime_seconds");
      expect(output).toContain("# TYPE ondc_uptime_seconds gauge");
      expect(output).toContain("ondc_requests_total{action=\"search\",status=\"success\"} 1");
      expect(output).toContain("ondc_requests_total{action=\"search\",status=\"error\"} 0");
    });

    it("should include latency summary lines", () => {
      collector.recordRequest("search", 150, true);
      const output = collector.toPrometheus();
      expect(output).toContain('ondc_latency_ms{action="search",quantile="0.5"}');
      expect(output).toContain('ondc_latency_ms{action="search",quantile="0.95"}');
      expect(output).toContain('ondc_latency_ms{action="search",quantile="0.99"}');
    });

    it("should include SLA violation counter", () => {
      collector.recordRequest("search", 500, true, 200);
      const output = collector.toPrometheus();
      expect(output).toContain('ondc_sla_violations_total{action="search"} 1');
    });

    it("should use custom prefix", () => {
      collector.recordRequest("search", 100, true);
      const output = collector.toPrometheus("myapp");
      expect(output).toContain("myapp_uptime_seconds");
      expect(output).toContain("myapp_requests_total");
    });

    it("should replace hyphens with underscores in action names", () => {
      collector.recordRequest("on-search", 100, true);
      const output = collector.toPrometheus();
      expect(output).toContain('action="on_search"');
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe("reset", () => {
    it("should clear all metrics", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("confirm", 200, false);
      collector.reset();
      const metrics = collector.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple actions tracked independently
  // -------------------------------------------------------------------------

  describe("multiple actions", () => {
    it("should track different actions independently", () => {
      collector.recordRequest("search", 100, true);
      collector.recordRequest("search", 200, false);
      collector.recordRequest("confirm", 50, true);
      const metrics = collector.getMetrics();

      expect(metrics["search"]!.totalRequests).toBe(2);
      expect(metrics["search"]!.errorCount).toBe(1);
      expect(metrics["confirm"]!.totalRequests).toBe(1);
      expect(metrics["confirm"]!.errorCount).toBe(0);
    });
  });
});
