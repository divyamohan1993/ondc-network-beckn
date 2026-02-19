// ---------------------------------------------------------------------------
// Health Monitor Types
// ---------------------------------------------------------------------------

export type ServiceStatus = "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";

export interface ServiceDefinition {
  name: string;
  url: string;
  port: number;
  healthPath: string;
}

export interface HealthCheckResult {
  service: string;
  status: ServiceStatus;
  responseTime: number;
  timestamp: string;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ServiceHealth {
  service: string;
  currentStatus: ServiceStatus;
  lastCheck: HealthCheckResult | null;
  history: HealthCheckResult[];
  uptimePercent: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  lastStatusChange: string | null;
  downSince: string | null;
}

export interface Alert {
  id: string;
  service: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  metadata?: Record<string, unknown>;
}

export type AlertType =
  | "SERVICE_DOWN"
  | "SERVICE_UP"
  | "HIGH_RESPONSE_TIME"
  | "SERVICE_RESTARTED"
  | "PROLONGED_DOWNTIME";

export type AlertSeverity = "critical" | "warning" | "info";

export interface MonitorConfig {
  checkIntervalMs: number;
  responseTimeThresholdMs: number;
  historySize: number;
  prolongedDowntimeMinutes: number;
}

export interface StatusSummary {
  up: number;
  down: number;
  degraded: number;
  unknown: number;
  total: number;
}

export interface SLAMetrics {
  service: string;
  uptimePercent: number;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalChecks: number;
  failedChecks: number;
}
