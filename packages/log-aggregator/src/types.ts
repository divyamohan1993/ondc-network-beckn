// ---------------------------------------------------------------------------
// Log Aggregator Types
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  id?: string;
  service: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface LogQueryParams {
  service?: string;
  level?: LogLevel;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface LogSearchParams {
  q: string;
  service?: string;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  totalLogs: number;
  byService: Record<string, number>;
  byLevel: Record<string, number>;
  errorRate: Record<string, number>;
  last24hVolume: number;
}

export interface StreamOptions {
  service?: string;
  level?: LogLevel;
}
