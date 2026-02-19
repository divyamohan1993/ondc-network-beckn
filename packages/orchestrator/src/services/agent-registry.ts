import { createLogger } from "@ondc/shared";
import {
  listContainers,
  inspectContainer,
  getContainerStats,
  type ContainerInfo,
  type ContainerStats,
} from "./docker-client.js";

const logger = createLogger("agent-registry");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentType = "infrastructure" | "core" | "agent" | "admin";

export type AgentStatus =
  | "running"
  | "stopped"
  | "restarting"
  | "unhealthy"
  | "unknown";

export interface AgentConfig {
  name: string;
  type: AgentType;
  healthUrl?: string;
  containerNamePattern?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: AgentType;
  containerId: string | null;
  containerName: string | null;
  status: AgentStatus;
  healthUrl: string | null;
  lastHealthCheck: string | null;
  uptime: number | null;
  restartCount: number;
  cpu: number | null;
  memory: number | null;
  memoryLimit: number | null;
  networkRx: number | null;
  networkTx: number | null;
}

export interface HealthCheckResult {
  name: string;
  healthy: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Built-in agent definitions
// ---------------------------------------------------------------------------

const BUILT_IN_AGENTS: AgentConfig[] = [
  { name: "postgres", type: "infrastructure" },
  { name: "redis", type: "infrastructure" },
  { name: "rabbitmq", type: "infrastructure" },
  { name: "registry", type: "core", healthUrl: "http://registry:3001/health" },
  { name: "gateway", type: "core", healthUrl: "http://gateway:3002/health" },
  { name: "bap", type: "core", healthUrl: "http://bap:3004/health" },
  { name: "bpp", type: "core", healthUrl: "http://bpp:3005/health" },
  { name: "admin", type: "admin", healthUrl: "http://admin:3003/api/health" },
  { name: "docs", type: "admin", healthUrl: "http://docs:3000/api/health" },
  { name: "vault", type: "agent", healthUrl: "http://vault:3006/health" },
  { name: "mock-server", type: "agent", healthUrl: "http://mock-server:3010/health" },
  { name: "health-monitor", type: "agent", healthUrl: "http://health-monitor:3008/health" },
  { name: "log-aggregator", type: "agent", healthUrl: "http://log-aggregator:3009/health" },
  { name: "simulation-engine", type: "agent", healthUrl: "http://simulation-engine:3011/health" },
  { name: "orchestrator", type: "agent", healthUrl: "self" },
];

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

export class AgentRegistry {
  private agents: Map<string, AgentInfo> = new Map();
  private selfPort: number;

  constructor(selfPort = 3007) {
    this.selfPort = selfPort;
  }

  /**
   * Initialize the registry with all built-in agents.
   */
  async init(): Promise<void> {
    for (const config of BUILT_IN_AGENTS) {
      this.registerAgent(config);
    }
    logger.info({ count: this.agents.size }, "Agent registry initialized");

    // Do an initial container discovery
    await this.discoverContainers();
  }

  /**
   * Register a new agent in the registry.
   */
  registerAgent(config: AgentConfig): void {
    const existing = this.agents.get(config.name);
    if (existing) {
      // Update config but preserve runtime state
      existing.type = config.type;
      existing.healthUrl = config.healthUrl === "self"
        ? `http://localhost:${this.selfPort}/health`
        : config.healthUrl ?? null;
      return;
    }

    const agent: AgentInfo = {
      id: config.name,
      name: config.name,
      type: config.type,
      containerId: null,
      containerName: null,
      status: "unknown",
      healthUrl: config.healthUrl === "self"
        ? `http://localhost:${this.selfPort}/health`
        : config.healthUrl ?? null,
      lastHealthCheck: null,
      uptime: null,
      restartCount: 0,
      cpu: null,
      memory: null,
      memoryLimit: null,
      networkRx: null,
      networkTx: null,
    };

    this.agents.set(config.name, agent);
    logger.debug({ name: config.name, type: config.type }, "Agent registered");
  }

  /**
   * Get information about a specific agent.
   */
  getAgent(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all registered agents.
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Update the status and optional stats for an agent.
   */
  updateAgentStatus(
    name: string,
    status: AgentStatus,
    stats?: Partial<Pick<AgentInfo, "cpu" | "memory" | "memoryLimit" | "networkRx" | "networkTx">>,
  ): void {
    const agent = this.agents.get(name);
    if (!agent) {
      logger.warn({ name }, "Attempted to update unknown agent");
      return;
    }

    agent.status = status;
    if (stats) {
      if (stats.cpu !== undefined) agent.cpu = stats.cpu;
      if (stats.memory !== undefined) agent.memory = stats.memory;
      if (stats.memoryLimit !== undefined) agent.memoryLimit = stats.memoryLimit;
      if (stats.networkRx !== undefined) agent.networkRx = stats.networkRx;
      if (stats.networkTx !== undefined) agent.networkTx = stats.networkTx;
    }
  }

  /**
   * Discover Docker containers and map them to registered agents.
   */
  async discoverContainers(): Promise<void> {
    try {
      const containers = await listContainers();

      // Build a lookup by compose service name
      const containerByService = new Map<string, ContainerInfo>();
      for (const c of containers) {
        const serviceName = c.Labels?.["com.docker.compose.service"];
        if (serviceName) {
          containerByService.set(serviceName, c);
        }
        // Also try matching by container name
        for (const name of c.Names) {
          const cleanName = name.replace(/^\//, "");
          containerByService.set(cleanName, c);
        }
      }

      // Match containers to agents
      for (const agent of this.agents.values()) {
        const container =
          containerByService.get(agent.name) ??
          containerByService.get(`${agent.name}-1`);

        if (container) {
          agent.containerId = container.Id;
          agent.containerName = container.Names[0]?.replace(/^\//, "") ?? null;
          agent.status = mapDockerState(container.State);
        } else {
          agent.containerId = null;
          agent.containerName = null;
          // Don't override status if we already have health data
          if (agent.status === "unknown") {
            agent.status = "stopped";
          }
        }
      }

      logger.debug({ matched: containers.length }, "Container discovery complete");
    } catch (err) {
      logger.error({ err }, "Container discovery failed");
    }
  }

  /**
   * Collect stats for all running containers.
   */
  async collectStats(): Promise<void> {
    const agents = this.getAllAgents().filter(
      (a) => a.containerId && a.status === "running",
    );

    const results = await Promise.allSettled(
      agents.map(async (agent) => {
        if (!agent.containerId) return;
        try {
          const stats = await getContainerStats(agent.containerId);
          this.updateAgentStatus(agent.name, agent.status, {
            cpu: stats.cpuPercent,
            memory: stats.memoryUsageMb,
            memoryLimit: stats.memoryLimitMb,
            networkRx: stats.networkRxMb,
            networkTx: stats.networkTxMb,
          });
          return { name: agent.name, stats };
        } catch {
          logger.debug({ name: agent.name }, "Failed to collect stats");
          return undefined;
        }
      }),
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value !== undefined,
    ).length;
    logger.debug({ successful, total: agents.length }, "Stats collection complete");
  }

  /**
   * Get uptime info for containers that are running.
   */
  async refreshUptimeInfo(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (!agent.containerId || agent.status !== "running") {
        agent.uptime = null;
        continue;
      }
      try {
        const detail = await inspectContainer(agent.containerId);
        const startedAt = new Date(detail.State.StartedAt).getTime();
        agent.uptime = (Date.now() - startedAt) / 1000; // seconds
        agent.restartCount = detail.RestartCount ?? 0;
      } catch {
        // Ignore -- container may have just stopped
      }
    }
  }

  /**
   * Run health checks on all agents that have a health URL.
   */
  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    const agents = this.getAllAgents().filter((a) => a.healthUrl !== null);

    const checks = await Promise.allSettled(
      agents.map(async (agent) => {
        const result = await this.checkHealth(agent);
        results.push(result);
        return result;
      }),
    );

    // Log summary
    const healthy = results.filter((r) => r.healthy).length;
    logger.info(
      { healthy, unhealthy: results.length - healthy, total: results.length },
      "Health checks completed",
    );

    return results;
  }

  /**
   * Check health for a single agent.
   */
  async checkHealth(agent: AgentInfo): Promise<HealthCheckResult> {
    if (!agent.healthUrl) {
      return {
        name: agent.name,
        healthy: false,
        statusCode: null,
        responseTimeMs: 0,
        error: "No health URL configured",
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(agent.healthUrl, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseTimeMs = Math.round(performance.now() - startTime);
      const healthy = response.status >= 200 && response.status < 300;

      agent.lastHealthCheck = new Date().toISOString();

      if (healthy && agent.status !== "running") {
        this.updateAgentStatus(agent.name, "running");
      } else if (!healthy && agent.status === "running") {
        this.updateAgentStatus(agent.name, "unhealthy");
      }

      return {
        name: agent.name,
        healthy,
        statusCode: response.status,
        responseTimeMs,
        error: healthy ? null : `HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const responseTimeMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // If fetch fails, the service is likely down
      if (agent.status === "running" || agent.status === "unknown") {
        // Only mark unhealthy if we had a container match,
        // otherwise mark as stopped
        if (agent.containerId) {
          this.updateAgentStatus(agent.name, "unhealthy");
        } else {
          this.updateAgentStatus(agent.name, "stopped");
        }
      }

      agent.lastHealthCheck = new Date().toISOString();

      return {
        name: agent.name,
        healthy: false,
        statusCode: null,
        responseTimeMs,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get a summary of agent statuses.
   */
  getSummary(): {
    total: number;
    running: number;
    stopped: number;
    unhealthy: number;
    unknown: number;
    byType: Record<AgentType, { total: number; running: number }>;
  } {
    const agents = this.getAllAgents();
    const byType: Record<AgentType, { total: number; running: number }> = {
      infrastructure: { total: 0, running: 0 },
      core: { total: 0, running: 0 },
      agent: { total: 0, running: 0 },
      admin: { total: 0, running: 0 },
    };

    let running = 0;
    let stopped = 0;
    let unhealthy = 0;
    let unknown = 0;

    for (const agent of agents) {
      byType[agent.type].total++;
      switch (agent.status) {
        case "running":
          running++;
          byType[agent.type].running++;
          break;
        case "stopped":
          stopped++;
          break;
        case "unhealthy":
        case "restarting":
          unhealthy++;
          break;
        default:
          unknown++;
      }
    }

    return {
      total: agents.length,
      running,
      stopped,
      unhealthy,
      unknown,
      byType,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapDockerState(state: string): AgentStatus {
  switch (state.toLowerCase()) {
    case "running":
      return "running";
    case "exited":
    case "dead":
    case "created":
      return "stopped";
    case "restarting":
      return "restarting";
    case "paused":
      return "stopped";
    default:
      return "unknown";
  }
}
