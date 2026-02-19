import { request } from "undici";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { eq, desc, sql } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import type { Database } from "@ondc/shared/db";

import { healthSnapshots, alerts as alertsTable } from "../schema.js";
import type {
  ServiceDefinition,
  ServiceHealth,
  HealthCheckResult,
  ServiceStatus,
  Alert,
  AlertType,
  AlertSeverity,
  MonitorConfig,
  StatusSummary,
  SLAMetrics,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const logger = createLogger("health-monitor");

const DEFAULT_SERVICES: ServiceDefinition[] = [
  { name: "registry", url: "http://localhost:3001", port: 3001, healthPath: "/health" },
  { name: "gateway", url: "http://localhost:3002", port: 3002, healthPath: "/health" },
  { name: "admin", url: "http://localhost:3003", port: 3003, healthPath: "/api/health/check" },
  { name: "bap", url: "http://localhost:3004", port: 3004, healthPath: "/health" },
  { name: "bpp", url: "http://localhost:3005", port: 3005, healthPath: "/health" },
  { name: "vault", url: "http://localhost:3006", port: 3006, healthPath: "/health" },
  { name: "orchestrator", url: "http://localhost:3007", port: 3007, healthPath: "/health" },
  { name: "mock-server", url: "http://localhost:3010", port: 3010, healthPath: "/health" },
];

const DEFAULT_CONFIG: MonitorConfig = {
  checkIntervalMs: 15_000,
  responseTimeThresholdMs: 5_000,
  historySize: 100,
  prolongedDowntimeMinutes: 5,
};

// ---------------------------------------------------------------------------
// HealthMonitor
// ---------------------------------------------------------------------------

export class HealthMonitor {
  private services: ServiceDefinition[];
  private config: MonitorConfig;
  private db: Database;
  private redis: Redis;

  /** In-memory health history keyed by service name. */
  private healthMap: Map<string, ServiceHealth> = new Map();

  /** In-memory alert buffer (last 100). */
  private recentAlerts: Alert[] = [];

  /** Handle returned by setInterval so we can cancel later. */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Flag to stop the monitoring loop. */
  private running = false;

  constructor(db: Database, redis: Redis, services?: ServiceDefinition[], config?: Partial<MonitorConfig>) {
    this.db = db;
    this.redis = redis;
    this.services = services ?? DEFAULT_SERVICES;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize health map
    for (const svc of this.services) {
      this.healthMap.set(svc.name, {
        service: svc.name,
        currentStatus: "UNKNOWN",
        lastCheck: null,
        history: [],
        uptimePercent: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        lastStatusChange: null,
        downSince: null,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Start the periodic health-check loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    logger.info(
      { intervalMs: this.config.checkIntervalMs, services: this.services.map((s) => s.name) },
      "Starting health monitor",
    );

    // Perform an immediate first check
    void this.runChecks();

    this.intervalHandle = setInterval(() => {
      void this.runChecks();
    }, this.config.checkIntervalMs);
  }

  /** Stop the monitoring loop. */
  stop(): void {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info("Health monitor stopped");
  }

  /** Get the current health state for all services. */
  getAllStatus(): ServiceHealth[] {
    return Array.from(this.healthMap.values());
  }

  /** Get detailed health for a single service. */
  getServiceStatus(serviceName: string): ServiceHealth | undefined {
    return this.healthMap.get(serviceName);
  }

  /** Get summary counts. */
  getSummary(): StatusSummary {
    const summary: StatusSummary = { up: 0, down: 0, degraded: 0, unknown: 0, total: 0 };
    for (const health of this.healthMap.values()) {
      summary.total++;
      switch (health.currentStatus) {
        case "UP":
          summary.up++;
          break;
        case "DOWN":
          summary.down++;
          break;
        case "DEGRADED":
          summary.degraded++;
          break;
        default:
          summary.unknown++;
      }
    }
    return summary;
  }

  /** Compute SLA metrics for all services. */
  getSLAMetrics(): SLAMetrics[] {
    return this.services.map((svc) => this.computeSLAMetrics(svc.name));
  }

  /** Get recent alerts (last 100 in memory). */
  getRecentAlerts(): Alert[] {
    return [...this.recentAlerts];
  }

  /** Acknowledge an alert by ID. */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<Alert | null> {
    const alert = this.recentAlerts.find((a) => a.id === alertId);
    if (!alert) return null;

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy ?? "system";

    // Persist to database
    try {
      await this.db
        .update(alertsTable)
        .set({
          acknowledged: true,
          acknowledged_at: new Date(),
          acknowledged_by: alert.acknowledgedBy,
        })
        .where(eq(alertsTable.id, alertId));
    } catch (err) {
      logger.error({ err, alertId }, "Failed to persist alert acknowledgement");
    }

    return alert;
  }

  /** Update monitoring configuration. */
  updateConfig(updates: Partial<MonitorConfig>): MonitorConfig {
    this.config = { ...this.config, ...updates };

    // Restart the interval if the check interval changed
    if (updates.checkIntervalMs && this.running) {
      this.stop();
      this.start();
    }

    logger.info({ config: this.config }, "Monitor config updated");
    return this.config;
  }

  /** Get current configuration. */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Perform health checks for all services. */
  private async runChecks(): Promise<void> {
    const checks = this.services.map((svc) => this.checkService(svc));
    const results = await Promise.allSettled(checks);

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const svc = this.services[i]!;

      if (result.status === "fulfilled") {
        this.processCheckResult(svc.name, result.value);
      } else {
        const failResult: HealthCheckResult = {
          service: svc.name,
          status: "DOWN",
          responseTime: -1,
          timestamp: new Date().toISOString(),
          error: String(result.reason),
        };
        this.processCheckResult(svc.name, failResult);
      }
    }
  }

  /** Check a single service's health endpoint. */
  private async checkService(svc: ServiceDefinition): Promise<HealthCheckResult> {
    const url = `${svc.url}${svc.healthPath}`;
    const start = performance.now();

    try {
      const response = await request(url, {
        method: "GET",
        headersTimeout: this.config.responseTimeThresholdMs,
        bodyTimeout: this.config.responseTimeThresholdMs,
      });

      const elapsed = Math.round(performance.now() - start);

      // Attempt to parse response body
      let metadata: Record<string, unknown> | undefined;
      try {
        const body = await response.body.json() as Record<string, unknown>;
        metadata = body;
      } catch {
        // Body may not be JSON; ignore
        await response.body.dump();
      }

      let status: ServiceStatus;
      if (response.statusCode >= 200 && response.statusCode < 300) {
        status = elapsed > this.config.responseTimeThresholdMs ? "DEGRADED" : "UP";
      } else if (response.statusCode >= 500) {
        status = "DOWN";
      } else {
        status = "DEGRADED";
      }

      return {
        service: svc.name,
        status,
        responseTime: elapsed,
        timestamp: new Date().toISOString(),
        statusCode: response.statusCode,
        metadata,
      };
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      return {
        service: svc.name,
        status: "DOWN",
        responseTime: elapsed,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Process a check result: update history, detect status changes, emit alerts. */
  private processCheckResult(serviceName: string, result: HealthCheckResult): void {
    const health = this.healthMap.get(serviceName);
    if (!health) return;

    const previousStatus = health.currentStatus;
    const previousUptime = health.lastCheck?.metadata?.["uptime"];

    // Update history (ring buffer of N entries)
    health.history.push(result);
    if (health.history.length > this.config.historySize) {
      health.history.shift();
    }

    health.lastCheck = result;
    health.currentStatus = result.status;

    // Update uptime calculations
    const upChecks = health.history.filter((h) => h.status === "UP" || h.status === "DEGRADED").length;
    health.uptimePercent = health.history.length > 0 ? (upChecks / health.history.length) * 100 : 0;

    // Calculate average and p95 response times
    const responseTimes = health.history
      .filter((h) => h.responseTime >= 0)
      .map((h) => h.responseTime);

    if (responseTimes.length > 0) {
      health.avgResponseTime = Math.round(
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      );
      health.p95ResponseTime = this.percentile(responseTimes, 95);
    }

    // Detect status changes and generate alerts
    if (previousStatus !== "UNKNOWN" && previousStatus !== result.status) {
      health.lastStatusChange = result.timestamp;

      if (result.status === "DOWN") {
        health.downSince = result.timestamp;
        this.emitAlert({
          service: serviceName,
          type: "SERVICE_DOWN",
          message: `Service ${serviceName} is DOWN${result.error ? `: ${result.error}` : ""}`,
          severity: "critical",
          metadata: { previousStatus, error: result.error },
        });
      } else if (previousStatus === "DOWN" && result.status === "UP") {
        health.downSince = null;
        this.emitAlert({
          service: serviceName,
          type: "SERVICE_UP",
          message: `Service ${serviceName} has recovered and is UP`,
          severity: "info",
          metadata: { previousStatus, responseTime: result.responseTime },
        });
      }
    }

    // Check for high response time
    if (
      result.status !== "DOWN" &&
      result.responseTime > this.config.responseTimeThresholdMs
    ) {
      this.emitAlert({
        service: serviceName,
        type: "HIGH_RESPONSE_TIME",
        message: `Service ${serviceName} response time ${result.responseTime}ms exceeds threshold ${this.config.responseTimeThresholdMs}ms`,
        severity: "warning",
        metadata: { responseTime: result.responseTime, threshold: this.config.responseTimeThresholdMs },
      });
    }

    // Check for service restart (uptime went down)
    const currentUptime = result.metadata?.["uptime"];
    if (
      typeof previousUptime === "number" &&
      typeof currentUptime === "number" &&
      currentUptime < previousUptime
    ) {
      this.emitAlert({
        service: serviceName,
        type: "SERVICE_RESTARTED",
        message: `Service ${serviceName} appears to have restarted (uptime dropped from ${previousUptime}s to ${currentUptime}s)`,
        severity: "warning",
        metadata: { previousUptime, currentUptime },
      });
    }

    // Check for prolonged downtime
    if (health.downSince) {
      const downDurationMs = Date.now() - new Date(health.downSince).getTime();
      const downMinutes = downDurationMs / 60_000;
      if (downMinutes >= this.config.prolongedDowntimeMinutes) {
        // Only alert once per prolonged window (check if last prolonged alert was recent)
        const lastProlonged = this.recentAlerts.find(
          (a) =>
            a.service === serviceName &&
            a.type === "PROLONGED_DOWNTIME" &&
            Date.now() - new Date(a.timestamp).getTime() < this.config.prolongedDowntimeMinutes * 60_000,
        );
        if (!lastProlonged) {
          this.emitAlert({
            service: serviceName,
            type: "PROLONGED_DOWNTIME",
            message: `Service ${serviceName} has been DOWN for ${Math.round(downMinutes)} minutes`,
            severity: "critical",
            metadata: { downSince: health.downSince, downMinutes: Math.round(downMinutes) },
          });
        }
      }
    }

    // Persist health snapshot to database (fire and forget)
    void this.persistSnapshot(result);
  }

  /** Emit an alert: log, store in memory, publish to Redis, persist to DB. */
  private emitAlert(params: {
    service: string;
    type: AlertType;
    message: string;
    severity: AlertSeverity;
    metadata?: Record<string, unknown>;
  }): void {
    const alert: Alert = {
      id: randomUUID(),
      service: params.service,
      type: params.type,
      message: params.message,
      severity: params.severity,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      metadata: params.metadata,
    };

    // Log
    const logMethod = params.severity === "critical" ? "error" : params.severity === "warning" ? "warn" : "info";
    logger[logMethod]({ alert }, `Alert: ${params.message}`);

    // Store in memory (ring buffer of 100)
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > 100) {
      this.recentAlerts.pop();
    }

    // Publish to Redis pub/sub
    void this.redis
      .publish("alerts", JSON.stringify(alert))
      .catch((err) => logger.error({ err }, "Failed to publish alert to Redis"));

    // Persist to database
    void this.persistAlert(alert);
  }

  /** Persist a health snapshot to the database. */
  private async persistSnapshot(result: HealthCheckResult): Promise<void> {
    try {
      await this.db.insert(healthSnapshots).values({
        service: result.service,
        status: result.status,
        response_time: result.responseTime,
        status_code: result.statusCode ?? null,
        error: result.error ?? null,
        metadata: result.metadata ?? null,
        checked_at: new Date(result.timestamp),
      });
    } catch (err) {
      logger.error({ err, service: result.service }, "Failed to persist health snapshot");
    }
  }

  /** Persist an alert to the database. */
  private async persistAlert(alert: Alert): Promise<void> {
    try {
      await this.db.insert(alertsTable).values({
        id: alert.id,
        service: alert.service,
        type: alert.type,
        message: alert.message,
        severity: alert.severity,
        acknowledged: alert.acknowledged,
        metadata: alert.metadata ?? null,
        created_at: new Date(alert.timestamp),
      });
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to persist alert");
    }
  }

  /** Compute the Nth percentile of a sorted array of numbers. */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }

  /** Compute SLA metrics for a given service. */
  private computeSLAMetrics(serviceName: string): SLAMetrics {
    const health = this.healthMap.get(serviceName);
    if (!health || health.history.length === 0) {
      return {
        service: serviceName,
        uptimePercent: 0,
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        totalChecks: 0,
        failedChecks: 0,
      };
    }

    const responseTimes = health.history
      .filter((h) => h.responseTime >= 0)
      .map((h) => h.responseTime);

    const totalChecks = health.history.length;
    const failedChecks = health.history.filter((h) => h.status === "DOWN").length;

    return {
      service: serviceName,
      uptimePercent: health.uptimePercent,
      avgResponseTime: health.avgResponseTime,
      p50ResponseTime: this.percentile(responseTimes, 50),
      p95ResponseTime: this.percentile(responseTimes, 95),
      p99ResponseTime: this.percentile(responseTimes, 99),
      totalChecks,
      failedChecks,
    };
  }
}
