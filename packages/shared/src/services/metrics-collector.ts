import { createLogger } from "../utils/logger.js";

const logger = createLogger("metrics");

interface LatencyBucket {
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  values: number[];
}

interface ActionMetrics {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  latency: LatencyBucket;
  slaViolations: number;
  lastUpdated: number;
}

/**
 * In-memory metrics collector for ONDC network observability.
 * Tracks per-action latency percentiles, error rates, throughput, and SLA compliance.
 *
 * Metrics are stored in-memory and flushed/reported periodically.
 * The collector caps stored latency values to prevent unbounded memory growth.
 */
export class MetricsCollector {
  private metrics: Map<string, ActionMetrics> = new Map();
  private readonly maxValues = 10000; // Keep last 10K values per action for percentile calculation
  private startTime = Date.now();

  /**
   * Record a request completion.
   */
  recordRequest(action: string, latencyMs: number, success: boolean, slaMs?: number): void {
    let m = this.metrics.get(action);
    if (!m) {
      m = {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        latency: { count: 0, sum: 0, min: Infinity, max: 0, p50: 0, p95: 0, p99: 0, values: [] },
        slaViolations: 0,
        lastUpdated: Date.now(),
      };
      this.metrics.set(action, m);
    }

    m.totalRequests++;
    if (success) m.successCount++;
    else m.errorCount++;

    m.latency.count++;
    m.latency.sum += latencyMs;
    m.latency.min = Math.min(m.latency.min, latencyMs);
    m.latency.max = Math.max(m.latency.max, latencyMs);

    // Ring buffer for percentile calculation
    if (m.latency.values.length >= this.maxValues) {
      m.latency.values.shift();
    }
    m.latency.values.push(latencyMs);

    if (slaMs && latencyMs > slaMs) {
      m.slaViolations++;
    }

    m.lastUpdated = Date.now();

    // Recalculate percentiles
    this.updatePercentiles(m.latency);
  }

  private updatePercentiles(bucket: LatencyBucket): void {
    if (bucket.values.length === 0) return;
    const sorted = [...bucket.values].sort((a, b) => a - b);
    bucket.p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    bucket.p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    bucket.p99 = sorted[Math.floor(sorted.length * 0.99)]!;
  }

  /**
   * Get metrics for all actions.
   */
  getMetrics(): Record<string, {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    errorRate: number;
    slaViolations: number;
    slaComplianceRate: number;
    latency: { avg: number; min: number; max: number; p50: number; p95: number; p99: number };
  }> {
    const result: Record<string, {
      totalRequests: number;
      successCount: number;
      errorCount: number;
      errorRate: number;
      slaViolations: number;
      slaComplianceRate: number;
      latency: { avg: number; min: number; max: number; p50: number; p95: number; p99: number };
    }> = {};
    for (const [action, m] of this.metrics) {
      result[action] = {
        totalRequests: m.totalRequests,
        successCount: m.successCount,
        errorCount: m.errorCount,
        errorRate: m.totalRequests > 0 ? m.errorCount / m.totalRequests : 0,
        slaViolations: m.slaViolations,
        slaComplianceRate: m.totalRequests > 0 ? 1 - (m.slaViolations / m.totalRequests) : 1,
        latency: {
          avg: m.latency.count > 0 ? Math.round(m.latency.sum / m.latency.count) : 0,
          min: m.latency.min === Infinity ? 0 : Math.round(m.latency.min),
          max: Math.round(m.latency.max),
          p50: Math.round(m.latency.p50),
          p95: Math.round(m.latency.p95),
          p99: Math.round(m.latency.p99),
        },
      };
    }
    return result;
  }

  /**
   * Get Prometheus-compatible text format output.
   */
  toPrometheus(prefix: string = "ondc"): string {
    const lines: string[] = [];
    const uptime = (Date.now() - this.startTime) / 1000;

    lines.push(`# HELP ${prefix}_uptime_seconds Service uptime in seconds`);
    lines.push(`# TYPE ${prefix}_uptime_seconds gauge`);
    lines.push(`${prefix}_uptime_seconds ${uptime.toFixed(1)}`);

    for (const [action, m] of this.metrics) {
      const a = action.replace(/-/g, "_");

      lines.push(`# HELP ${prefix}_requests_total Total requests by action`);
      lines.push(`# TYPE ${prefix}_requests_total counter`);
      lines.push(`${prefix}_requests_total{action="${a}",status="success"} ${m.successCount}`);
      lines.push(`${prefix}_requests_total{action="${a}",status="error"} ${m.errorCount}`);

      lines.push(`# HELP ${prefix}_latency_ms Request latency in milliseconds`);
      lines.push(`# TYPE ${prefix}_latency_ms summary`);
      lines.push(`${prefix}_latency_ms{action="${a}",quantile="0.5"} ${Math.round(m.latency.p50)}`);
      lines.push(`${prefix}_latency_ms{action="${a}",quantile="0.95"} ${Math.round(m.latency.p95)}`);
      lines.push(`${prefix}_latency_ms{action="${a}",quantile="0.99"} ${Math.round(m.latency.p99)}`);
      lines.push(`${prefix}_latency_ms_sum{action="${a}"} ${Math.round(m.latency.sum)}`);
      lines.push(`${prefix}_latency_ms_count{action="${a}"} ${m.latency.count}`);

      lines.push(`# HELP ${prefix}_sla_violations_total SLA violations by action`);
      lines.push(`# TYPE ${prefix}_sla_violations_total counter`);
      lines.push(`${prefix}_sla_violations_total{action="${a}"} ${m.slaViolations}`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Reset all metrics (e.g., after reporting).
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }
}

/**
 * Global singleton metrics collector.
 */
export const globalMetrics = new MetricsCollector();
