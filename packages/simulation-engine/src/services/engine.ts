import { randomUUID } from "node:crypto";
import { request } from "undici";
import type { Redis } from "ioredis";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { generateKeyPair } from "@ondc/shared/crypto";
import type { Database } from "@ondc/shared/db";
import { subscribers, transactions } from "@ondc/shared/db";

import { simulationEngineRuns } from "../schema.js";
import type {
  SimulationConfig,
  SimulationProfile,
  SimulationProfileDefinition,
  SimulationRun,
  SimulationStats,
  SimulationStatus,
  SimulationProgress,
  OrderResult,
  StepResult,
  OrderFlowStep,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const logger = createLogger("simulation-engine");

/** Standard ONDC order flow. */
const ORDER_FLOW: OrderFlowStep[] = [
  { action: "search", callbackAction: "on_search" },
  { action: "select", callbackAction: "on_select" },
  { action: "init", callbackAction: "on_init" },
  { action: "confirm", callbackAction: "on_confirm" },
  { action: "status", callbackAction: "on_status" },
];

/** Predefined simulation profiles. */
const PROFILES: SimulationProfileDefinition[] = [
  {
    name: "smoke-test",
    description: "Quick validation: 2 BAPs, 3 BPPs, 10 orders",
    config: {
      numBaps: 2,
      numBpps: 3,
      numOrders: 10,
      domains: ["ONDC:RET10"],
      cities: ["std:080"],
      concurrency: 2,
      delayBetweenOrders: 500,
    },
  },
  {
    name: "load-test",
    description: "Stress test: 10 BAPs, 20 BPPs, 1000 orders",
    config: {
      numBaps: 10,
      numBpps: 20,
      numOrders: 1000,
      domains: ["ONDC:RET10", "ONDC:NIC2004:49299"],
      cities: ["std:080", "std:011"],
      concurrency: 20,
      delayBetweenOrders: 100,
    },
  },
  {
    name: "endurance",
    description: "Continuous test for a configurable duration",
    config: {
      numBaps: 5,
      numBpps: 10,
      numOrders: 0, // determined by duration
      domains: ["ONDC:RET10"],
      cities: ["std:080"],
      concurrency: 5,
      delayBetweenOrders: 200,
      duration: 300, // 5 minutes default
    },
  },
  {
    name: "custom",
    description: "User-defined simulation parameters",
    config: {
      numBaps: 1,
      numBpps: 1,
      numOrders: 1,
      domains: ["ONDC:RET10"],
      cities: ["std:080"],
      concurrency: 1,
      delayBetweenOrders: 0,
    },
  },
];

// ---------------------------------------------------------------------------
// SimulationEngine
// ---------------------------------------------------------------------------

export class SimulationEngine {
  private db: Database;
  private redis: Redis;

  /** Map of active simulations keyed by ID. */
  private activeSims: Map<string, SimulationRuntime> = new Map();

  /** Base URLs for the network services. */
  private gatewayUrl: string;
  private registryUrl: string;
  private mockServerUrl: string;

  constructor(
    db: Database,
    redis: Redis,
    opts?: {
      gatewayUrl?: string;
      registryUrl?: string;
      mockServerUrl?: string;
    },
  ) {
    this.db = db;
    this.redis = redis;
    this.gatewayUrl = opts?.gatewayUrl ?? "http://localhost:3002";
    this.registryUrl = opts?.registryUrl ?? "http://localhost:3001";
    this.mockServerUrl = opts?.mockServerUrl ?? "http://localhost:3010";
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Get available simulation profiles. */
  getProfiles(): SimulationProfileDefinition[] {
    return [...PROFILES];
  }

  /** Start a new simulation. */
  async startSimulation(
    profile?: SimulationProfile,
    customConfig?: Partial<SimulationConfig>,
  ): Promise<SimulationRun> {
    const resolvedProfile = profile ?? "custom";
    const baseProfile = PROFILES.find((p) => p.name === resolvedProfile);
    const config: SimulationConfig = {
      ...(baseProfile?.config ?? PROFILES[3]!.config),
      ...customConfig,
    };

    const id = randomUUID();
    const now = new Date().toISOString();

    const stats: SimulationStats = {
      totalOrders: config.numOrders,
      completedOrders: 0,
      failedOrders: 0,
      inProgressOrders: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughput: 0,
      errorBreakdown: {},
      startTime: now,
      elapsedMs: 0,
    };

    const run: SimulationRun = {
      id,
      profile: resolvedProfile,
      config,
      status: "RUNNING",
      stats,
      startedAt: now,
    };

    // Persist to database
    try {
      await this.db.insert(simulationEngineRuns).values({
        id,
        profile: resolvedProfile,
        config,
        status: "RUNNING",
        stats,
        started_at: new Date(now),
      });
    } catch (err) {
      logger.error({ err }, "Failed to persist simulation run");
    }

    // Create runtime and start execution
    const runtime = new SimulationRuntime(
      run,
      this.db,
      this.redis,
      this.gatewayUrl,
      this.registryUrl,
      this.mockServerUrl,
    );

    this.activeSims.set(id, runtime);

    // Start in background
    void runtime.execute().then(() => {
      this.activeSims.delete(id);
    });

    logger.info({ id, profile: resolvedProfile, config }, "Simulation started");

    return run;
  }

  /** List all simulations (from database + active ones). */
  async listSimulations(): Promise<SimulationRun[]> {
    const dbRuns = await this.db
      .select()
      .from(simulationEngineRuns)
      .orderBy(sql`${simulationEngineRuns.started_at} desc`)
      .limit(100);

    return dbRuns.map((row) => {
      // If it's active, get the live stats
      const active = this.activeSims.get(row.id);
      if (active) {
        const liveRun = active.getRun();
        return liveRun;
      }

      return {
        id: row.id,
        profile: row.profile as SimulationProfile,
        config: row.config as SimulationConfig,
        status: row.status as SimulationStatus,
        stats: (row.stats as SimulationStats) ?? this.emptyStats(),
        startedAt: row.started_at?.toISOString() ?? "",
        completedAt: row.completed_at?.toISOString(),
        cancelledAt: row.cancelled_at?.toISOString(),
      };
    });
  }

  /** Get a single simulation by ID. */
  async getSimulation(id: string): Promise<SimulationRun | null> {
    // Check active simulations first for live data
    const active = this.activeSims.get(id);
    if (active) {
      return active.getRun();
    }

    const rows = await this.db
      .select()
      .from(simulationEngineRuns)
      .where(eq(simulationEngineRuns.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      profile: row.profile as SimulationProfile,
      config: row.config as SimulationConfig,
      status: row.status as SimulationStatus,
      stats: (row.stats as SimulationStats) ?? this.emptyStats(),
      startedAt: row.started_at?.toISOString() ?? "",
      completedAt: row.completed_at?.toISOString(),
      cancelledAt: row.cancelled_at?.toISOString(),
    };
  }

  /** Get real-time progress for a simulation. */
  getProgress(id: string): SimulationProgress | null {
    const active = this.activeSims.get(id);
    if (!active) return null;
    return active.getProgress();
  }

  /** Pause a running simulation. */
  async pauseSimulation(id: string): Promise<SimulationRun | null> {
    const active = this.activeSims.get(id);
    if (!active) return null;

    active.pause();

    // Persist status
    await this.db
      .update(simulationEngineRuns)
      .set({ status: "PAUSED", stats: active.getRun().stats })
      .where(eq(simulationEngineRuns.id, id));

    logger.info({ id }, "Simulation paused");
    return active.getRun();
  }

  /** Resume a paused simulation. */
  async resumeSimulation(id: string): Promise<SimulationRun | null> {
    const active = this.activeSims.get(id);
    if (!active) return null;

    active.resume();

    // Persist status
    await this.db
      .update(simulationEngineRuns)
      .set({ status: "RUNNING" })
      .where(eq(simulationEngineRuns.id, id));

    logger.info({ id }, "Simulation resumed");
    return active.getRun();
  }

  /** Cancel a running or paused simulation. */
  async cancelSimulation(id: string): Promise<SimulationRun | null> {
    const active = this.activeSims.get(id);
    if (!active) return null;

    active.cancel();

    const now = new Date();
    await this.db
      .update(simulationEngineRuns)
      .set({
        status: "CANCELLED",
        cancelled_at: now,
        stats: active.getRun().stats,
      })
      .where(eq(simulationEngineRuns.id, id));

    this.activeSims.delete(id);

    logger.info({ id }, "Simulation cancelled");
    return active.getRun();
  }

  /** Delete all simulated data. */
  async deleteSimulatedData(): Promise<{
    deletedTransactions: number;
    deletedSubscribers: number;
  }> {
    const [txResult, subResult] = await Promise.all([
      this.db
        .delete(transactions)
        .where(eq(transactions.is_simulated, true))
        .returning({ id: transactions.id }),
      this.db
        .delete(subscribers)
        .where(eq(subscribers.is_simulated, true))
        .returning({ id: subscribers.id }),
    ]);

    const result = {
      deletedTransactions: txResult.length,
      deletedSubscribers: subResult.length,
    };

    logger.info(result, "Simulated data deleted");
    return result;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private emptyStats(): SimulationStats {
    return {
      totalOrders: 0,
      completedOrders: 0,
      failedOrders: 0,
      inProgressOrders: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughput: 0,
      errorBreakdown: {},
      startTime: "",
      elapsedMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// SimulationRuntime - manages a single simulation run execution
// ---------------------------------------------------------------------------

class SimulationRuntime {
  private run: SimulationRun;
  private db: Database;
  private redis: Redis;
  private gatewayUrl: string;
  private registryUrl: string;
  private mockServerUrl: string;

  private paused = false;
  private cancelled = false;
  private orderResults: OrderResult[] = [];
  private startTimeMs: number;

  constructor(
    run: SimulationRun,
    db: Database,
    redis: Redis,
    gatewayUrl: string,
    registryUrl: string,
    mockServerUrl: string,
  ) {
    this.run = run;
    this.db = db;
    this.redis = redis;
    this.gatewayUrl = gatewayUrl;
    this.registryUrl = registryUrl;
    this.mockServerUrl = mockServerUrl;
    this.startTimeMs = Date.now();
  }

  // -----------------------------------------------------------------------
  // Control
  // -----------------------------------------------------------------------

  pause(): void {
    this.paused = true;
    this.run.status = "PAUSED";
  }

  resume(): void {
    this.paused = false;
    this.run.status = "RUNNING";
  }

  cancel(): void {
    this.cancelled = true;
    this.run.status = "CANCELLED";
    this.run.cancelledAt = new Date().toISOString();
  }

  getRun(): SimulationRun {
    this.updateStats();
    return { ...this.run };
  }

  getProgress(): SimulationProgress {
    this.updateStats();
    const stats = this.run.stats;
    const completed = stats.completedOrders + stats.failedOrders;
    const total = stats.totalOrders || 1;
    const percent = Math.round((completed / total) * 100);
    const elapsed = Date.now() - this.startTimeMs;
    const throughput = elapsed > 0 ? (completed / elapsed) * 1000 : 0;
    const remaining =
      throughput > 0 ? ((total - completed) / throughput) * 1000 : 0;

    return {
      id: this.run.id,
      status: this.run.status,
      completedOrders: completed,
      totalOrders: total,
      percentComplete: percent,
      currentThroughput: Math.round(throughput * 100) / 100,
      elapsedMs: elapsed,
      estimatedRemainingMs: Math.round(remaining),
    };
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /** Run the full simulation. */
  async execute(): Promise<void> {
    const { config } = this.run;

    try {
      // Register simulated BAPs and BPPs
      await this.registerSimulatedParticipants(config);

      if (config.duration && config.duration > 0) {
        // Endurance mode: run continuously for the duration
        await this.runEndurance(config);
      } else {
        // Fixed-count mode: run a specific number of orders
        await this.runFixedOrders(config);
      }

      if (!this.cancelled) {
        this.run.status = "COMPLETED";
        this.run.completedAt = new Date().toISOString();
        this.updateStats();

        // Persist final state
        await this.db
          .update(simulationEngineRuns)
          .set({
            status: "COMPLETED",
            completed_at: new Date(),
            stats: this.run.stats,
          })
          .where(eq(simulationEngineRuns.id, this.run.id));

        // Broadcast completion
        void this.broadcastProgress();
      }

      logger.info(
        { id: this.run.id, stats: this.run.stats },
        "Simulation completed",
      );
    } catch (err) {
      this.run.status = "FAILED";
      this.updateStats();

      await this.db
        .update(simulationEngineRuns)
        .set({
          status: "FAILED",
          completed_at: new Date(),
          stats: this.run.stats,
        })
        .where(eq(simulationEngineRuns.id, this.run.id));

      logger.error({ err, id: this.run.id }, "Simulation failed");
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /** Run a fixed number of orders with concurrency control. */
  private async runFixedOrders(config: SimulationConfig): Promise<void> {
    const { numOrders, concurrency, delayBetweenOrders } = config;

    let orderIndex = 0;

    // Process orders in batches of `concurrency`
    while (orderIndex < numOrders && !this.cancelled) {
      // Wait while paused
      while (this.paused && !this.cancelled) {
        await this.sleep(500);
      }
      if (this.cancelled) break;

      const batchSize = Math.min(concurrency, numOrders - orderIndex);
      const batch: Promise<OrderResult>[] = [];

      for (let i = 0; i < batchSize; i++) {
        const idx = orderIndex + i;
        batch.push(this.executeOrder(idx, config));
      }

      this.run.stats.inProgressOrders = batchSize;
      const results = await Promise.allSettled(batch);

      for (const result of results) {
        if (result.status === "fulfilled") {
          this.orderResults.push(result.value);
        } else {
          this.orderResults.push({
            orderId: `order-${orderIndex}`,
            transactionId: "unknown",
            success: false,
            startTime: Date.now(),
            endTime: Date.now(),
            latencyMs: 0,
            steps: [],
            error: String(result.reason),
          });
        }
      }

      orderIndex += batchSize;
      this.updateStats();
      void this.broadcastProgress();

      // Delay between order batches
      if (delayBetweenOrders > 0 && orderIndex < numOrders) {
        await this.sleep(delayBetweenOrders);
      }
    }
  }

  /** Run orders continuously for a duration. */
  private async runEndurance(config: SimulationConfig): Promise<void> {
    const durationMs = (config.duration ?? 300) * 1000;
    const deadline = Date.now() + durationMs;
    let orderIndex = 0;

    // Update total orders dynamically
    this.run.stats.totalOrders = 0;

    while (Date.now() < deadline && !this.cancelled) {
      while (this.paused && !this.cancelled) {
        await this.sleep(500);
      }
      if (this.cancelled) break;

      const batchSize = config.concurrency;
      const batch: Promise<OrderResult>[] = [];

      for (let i = 0; i < batchSize; i++) {
        batch.push(this.executeOrder(orderIndex + i, config));
      }

      this.run.stats.totalOrders += batchSize;
      this.run.stats.inProgressOrders = batchSize;

      const results = await Promise.allSettled(batch);
      for (const result of results) {
        if (result.status === "fulfilled") {
          this.orderResults.push(result.value);
        } else {
          this.orderResults.push({
            orderId: `order-${orderIndex}`,
            transactionId: "unknown",
            success: false,
            startTime: Date.now(),
            endTime: Date.now(),
            latencyMs: 0,
            steps: [],
            error: String(result.reason),
          });
        }
      }

      orderIndex += batchSize;
      this.updateStats();
      void this.broadcastProgress();

      if (config.delayBetweenOrders > 0) {
        await this.sleep(config.delayBetweenOrders);
      }
    }
  }

  /** Execute a single simulated order through the full flow. */
  private async executeOrder(
    orderIndex: number,
    config: SimulationConfig,
  ): Promise<OrderResult> {
    const transactionId = randomUUID();
    const messageId = randomUUID();
    const orderId = `sim-order-${this.run.id.slice(0, 8)}-${orderIndex}`;

    const domain = config.domains[orderIndex % config.domains.length] ?? "ONDC:RET10";
    const city = config.cities[orderIndex % config.cities.length] ?? "std:080";
    const bapIndex = orderIndex % config.numBaps;
    const bppIndex = orderIndex % config.numBpps;
    const bapId = `sim-bap-${this.run.id.slice(0, 8)}-${bapIndex}`;
    const bppId = `sim-bpp-${this.run.id.slice(0, 8)}-${bppIndex}`;

    const startTime = Date.now();
    const steps: StepResult[] = [];
    let allSuccess = true;

    for (const step of ORDER_FLOW) {
      if (this.cancelled || this.paused) break;

      const stepStart = Date.now();
      const stepResult = await this.executeStep(
        step,
        transactionId,
        messageId,
        domain,
        city,
        bapId,
        bppId,
      );
      steps.push(stepResult);

      if (!stepResult.success) {
        allSuccess = false;
        break;
      }
    }

    const endTime = Date.now();

    return {
      orderId,
      transactionId,
      success: allSuccess,
      startTime,
      endTime,
      latencyMs: endTime - startTime,
      steps,
    };
  }

  /** Execute a single step in the order flow. */
  private async executeStep(
    step: OrderFlowStep,
    transactionId: string,
    messageId: string,
    domain: string,
    city: string,
    bapId: string,
    bppId: string,
  ): Promise<StepResult> {
    const stepStart = Date.now();

    try {
      const context = {
        domain,
        action: step.action,
        country: "IND",
        city,
        core_version: "1.1.0",
        bap_id: bapId,
        bap_uri: `${this.mockServerUrl}/bap/callback`,
        bpp_id: bppId,
        bpp_uri: `${this.mockServerUrl}/bpp/action`,
        transaction_id: transactionId,
        message_id: randomUUID(),
        timestamp: new Date().toISOString(),
        ttl: "PT30S",
      };

      const payload = {
        context,
        message: this.buildMessage(step.action, domain),
      };

      // Send to the BPP mock directly for simulation
      const targetUrl = `${this.mockServerUrl}/bpp/action/${step.action}`;

      const response = await request(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });

      const statusCode = response.statusCode;
      await response.body.dump();

      const latency = Date.now() - stepStart;

      // Log transaction to DB (fire and forget)
      void this.db
        .insert(transactions)
        .values({
          transaction_id: transactionId,
          message_id: messageId,
          action: step.action,
          bap_id: bapId,
          bpp_id: bppId,
          domain,
          city,
          request_body: payload,
          status: statusCode >= 200 && statusCode < 300 ? "ACK" : "NACK",
          latency_ms: latency,
          is_simulated: true,
        })
        .catch((err) => {
          logger.debug({ err, action: step.action }, "Failed to log sim transaction");
        });

      return {
        action: step.action,
        success: statusCode >= 200 && statusCode < 300,
        latencyMs: latency,
        statusCode,
      };
    } catch (err) {
      const latency = Date.now() - stepStart;
      return {
        action: step.action,
        success: false,
        latencyMs: latency,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Build a minimal ONDC message payload for a given action. */
  private buildMessage(action: string, domain: string): Record<string, unknown> {
    switch (action) {
      case "search":
        return {
          intent: {
            category: { id: domain },
            fulfillment: { type: "Delivery" },
            payment: { type: "ON-FULFILLMENT" },
          },
        };
      case "select":
        return {
          order: {
            provider: { id: "sim-provider-1" },
            items: [{ id: "sim-item-1", quantity: { count: 1 } }],
          },
        };
      case "init":
        return {
          order: {
            provider: { id: "sim-provider-1" },
            items: [{ id: "sim-item-1", quantity: { count: 1 } }],
            billing: {
              name: "Simulation User",
              phone: "9999999999",
              address: {
                door: "1",
                building: "Sim Building",
                street: "Sim Street",
                city: "Bangalore",
                state: "Karnataka",
                country: "IND",
                area_code: "560001",
              },
            },
            fulfillment: {
              end: {
                location: {
                  gps: "12.9716,77.5946",
                  address: {
                    door: "1",
                    building: "Sim Building",
                    street: "Sim Street",
                    city: "Bangalore",
                    state: "Karnataka",
                    country: "IND",
                    area_code: "560001",
                  },
                },
                contact: { phone: "9999999999" },
              },
            },
          },
        };
      case "confirm":
        return {
          order: {
            provider: { id: "sim-provider-1" },
            items: [{ id: "sim-item-1", quantity: { count: 1 } }],
            payment: {
              type: "ON-FULFILLMENT",
              params: {
                amount: "100.00",
                currency: "INR",
              },
            },
          },
        };
      case "status":
        return {
          order_id: "sim-order-1",
        };
      default:
        return {};
    }
  }

  /** Register simulated BAPs and BPPs as subscribers in the registry. */
  private async registerSimulatedParticipants(config: SimulationConfig): Promise<void> {
    const simSubscribers: Array<{
      subscriber_id: string;
      subscriber_url: string;
      type: "BAP" | "BPP";
      domain: string;
      city: string;
      signing_public_key: string;
      unique_key_id: string;
      status: "SUBSCRIBED";
      is_simulated: boolean;
    }> = [];

    for (let i = 0; i < config.numBaps; i++) {
      const bapId = `sim-bap-${this.run.id.slice(0, 8)}-${i}`;
      const bapKeyPair = generateKeyPair();
      simSubscribers.push({
        subscriber_id: bapId,
        subscriber_url: `${this.mockServerUrl}/bap/callback`,
        type: "BAP",
        domain: config.domains[0] ?? "ONDC:RET10",
        city: config.cities[0] ?? "std:080",
        signing_public_key: bapKeyPair.publicKey,
        unique_key_id: `${bapId}-key`,
        status: "SUBSCRIBED",
        is_simulated: true,
      });
      // Store private key in Redis for simulation signing
      await this.redis.set(
        `sim:privkey:${bapId}`,
        bapKeyPair.privateKey,
        "EX",
        86400, // 24hr TTL
      );
    }

    for (let i = 0; i < config.numBpps; i++) {
      const bppId = `sim-bpp-${this.run.id.slice(0, 8)}-${i}`;
      const bppKeyPair = generateKeyPair();
      simSubscribers.push({
        subscriber_id: bppId,
        subscriber_url: `${this.mockServerUrl}/bpp/action`,
        type: "BPP",
        domain: config.domains[0] ?? "ONDC:RET10",
        city: config.cities[0] ?? "std:080",
        signing_public_key: bppKeyPair.publicKey,
        unique_key_id: `${bppId}-key`,
        status: "SUBSCRIBED",
        is_simulated: true,
      });
      // Store private key in Redis for simulation signing
      await this.redis.set(
        `sim:privkey:${bppId}`,
        bppKeyPair.privateKey,
        "EX",
        86400, // 24hr TTL
      );
    }

    if (simSubscribers.length > 0) {
      try {
        await this.db.insert(subscribers).values(simSubscribers);
        logger.info(
          { baps: config.numBaps, bpps: config.numBpps },
          "Registered simulated participants",
        );
      } catch (err) {
        logger.warn({ err }, "Failed to register simulated participants (may already exist)");
      }
    }
  }

  /** Update computed stats from order results. */
  private updateStats(): void {
    const completed = this.orderResults.filter((r) => r.success).length;
    const failed = this.orderResults.filter((r) => !r.success).length;
    const latencies = this.orderResults
      .filter((r) => r.latencyMs > 0)
      .map((r) => r.latencyMs);

    const elapsed = Date.now() - this.startTimeMs;
    const total = completed + failed;
    const throughput = elapsed > 0 ? (total / elapsed) * 1000 : 0;

    // Calculate percentiles
    const sorted = [...latencies].sort((a, b) => a - b);

    const errorBreakdown: Record<string, number> = {};
    for (const result of this.orderResults) {
      if (!result.success) {
        for (const step of result.steps) {
          if (!step.success) {
            errorBreakdown[step.action] = (errorBreakdown[step.action] ?? 0) + 1;
          }
        }
      }
    }

    this.run.stats = {
      ...this.run.stats,
      completedOrders: completed,
      failedOrders: failed,
      inProgressOrders: this.run.stats.inProgressOrders,
      avgLatencyMs: sorted.length > 0
        ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
        : 0,
      p50LatencyMs: this.percentile(sorted, 50),
      p95LatencyMs: this.percentile(sorted, 95),
      p99LatencyMs: this.percentile(sorted, 99),
      throughput: Math.round(throughput * 100) / 100,
      errorBreakdown,
      elapsedMs: elapsed,
    };
  }

  /** Broadcast progress to Redis pub/sub. */
  private async broadcastProgress(): Promise<void> {
    try {
      const progress = this.getProgress();
      await this.redis.publish(
        "simulation:progress",
        JSON.stringify(progress),
      );
    } catch (err) {
      logger.debug({ err }, "Failed to broadcast simulation progress");
    }
  }

  /** Calculate the Nth percentile of a pre-sorted array. */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }

  /** Utility sleep function. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
