// ---------------------------------------------------------------------------
// Simulation Engine Types
// ---------------------------------------------------------------------------

export type SimulationStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type SimulationProfile = "smoke-test" | "load-test" | "endurance" | "custom";

export interface SimulationConfig {
  numBaps: number;
  numBpps: number;
  numOrders: number;
  domains: string[];
  cities: string[];
  concurrency: number;
  delayBetweenOrders: number;
  duration?: number; // seconds, for endurance profile
}

export interface SimulationProfileDefinition {
  name: SimulationProfile;
  description: string;
  config: SimulationConfig;
}

export interface OrderFlowStep {
  action: string;
  callbackAction: string;
}

export interface OrderResult {
  orderId: string;
  transactionId: string;
  success: boolean;
  startTime: number;
  endTime: number;
  latencyMs: number;
  steps: StepResult[];
  error?: string;
}

export interface StepResult {
  action: string;
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

export interface SimulationStats {
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  inProgressOrders: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughput: number; // orders per second
  errorBreakdown: Record<string, number>; // errors by action type
  startTime: string;
  endTime?: string;
  elapsedMs: number;
}

export interface SimulationRun {
  id: string;
  profile: SimulationProfile;
  config: SimulationConfig;
  status: SimulationStatus;
  stats: SimulationStats;
  startedAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface SimulationProgress {
  id: string;
  status: SimulationStatus;
  completedOrders: number;
  totalOrders: number;
  percentComplete: number;
  currentThroughput: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

export interface StartSimulationRequest {
  profile?: SimulationProfile;
  config?: Partial<SimulationConfig>;
}
