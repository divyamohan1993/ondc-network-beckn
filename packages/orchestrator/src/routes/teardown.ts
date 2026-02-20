import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { WsHub } from "../services/ws-hub.js";
import { verifyAuth } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Runtime mode detection — Docker vs Kubernetes
// ---------------------------------------------------------------------------

const isK8sMode =
  process.env["RUNTIME_MODE"] === "k8s" ||
  !!process.env["KUBERNETES_SERVICE_HOST"];

const clientModule = isK8sMode
  ? await import("../services/k8s-client.js")
  : await import("../services/docker-client.js");

const {
  startContainer,
  stopContainer,
  removeContainer,
  pruneContainers,
  pruneVolumes,
  execInContainer,
} = clientModule;

const logger = createLogger("teardown-routes");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeardownType = "soft" | "hard" | "full" | "reset";

export type TeardownStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

interface TeardownOperation {
  id: string;
  type: TeardownType;
  status: TeardownStatus;
  startedAt: string;
  completedAt: string | null;
  steps: TeardownStep[];
  error: string | null;
}

interface TeardownStep {
  name: string;
  status: TeardownStatus;
  message: string | null;
  timestamp: string;
}

export interface TeardownRoutesConfig {
  registry: AgentRegistry;
  wsHub: WsHub;
}

// ---------------------------------------------------------------------------
// In-memory operation store
// ---------------------------------------------------------------------------

const operations: Map<string, TeardownOperation> = new Map();

// ---------------------------------------------------------------------------
// Shutdown ordering
// ---------------------------------------------------------------------------

/** Application services (non-infrastructure, non-orchestrator) */
const APP_SERVICES = [
  "simulation-engine",
  "log-aggregator",
  "health-monitor",
  "mock-server",
  "vault",
  "docs",
  "admin",
  "bpp",
  "bap",
  "gateway",
  "registry",
];

/** Infrastructure services */
const INFRA_SERVICES = ["rabbitmq", "redis", "postgres"];

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerTeardownRoutes(
  fastify: FastifyInstance,
  config: TeardownRoutesConfig,
): void {
  const { registry, wsHub } = config;

  // -------------------------------------------------------------------------
  // POST /teardown/soft - Stop all app services, keep infra and data
  // -------------------------------------------------------------------------
  fastify.post(
    "/teardown/soft",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const operation = createOperation("soft");
      logger.info({ operationId: operation.id }, "Starting soft teardown");

      // Return immediately with operation ID
      reply.code(202).send({
        operationId: operation.id,
        type: "soft",
        message: "Soft teardown initiated. App services will be stopped; infrastructure and data preserved.",
      });

      // Execute in background
      void executeSoftTeardown(operation, registry, wsHub);
    },
  );

  // -------------------------------------------------------------------------
  // POST /teardown/hard - Stop everything, delete all containers
  // -------------------------------------------------------------------------
  fastify.post(
    "/teardown/hard",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const operation = createOperation("hard");
      logger.info({ operationId: operation.id }, "Starting hard teardown");

      reply.code(202).send({
        operationId: operation.id,
        type: "hard",
        message: "Hard teardown initiated. All services will be stopped and containers deleted.",
      });

      void executeHardTeardown(operation, registry, wsHub);
    },
  );

  // -------------------------------------------------------------------------
  // POST /teardown/full - Stop everything, delete containers AND volumes
  // -------------------------------------------------------------------------
  fastify.post(
    "/teardown/full",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const operation = createOperation("full");
      logger.info({ operationId: operation.id }, "Starting full teardown (DATA LOSS!)");

      reply.code(202).send({
        operationId: operation.id,
        type: "full",
        message: "Full teardown initiated. All services stopped, containers AND volumes will be deleted. DATA WILL BE LOST!",
      });

      void executeFullTeardown(operation, registry, wsHub);
    },
  );

  // -------------------------------------------------------------------------
  // POST /teardown/reset - Stop all, wipe DB, re-run init.sql, restart
  // -------------------------------------------------------------------------
  fastify.post(
    "/teardown/reset",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const operation = createOperation("reset");
      logger.info({ operationId: operation.id }, "Starting reset teardown");

      reply.code(202).send({
        operationId: operation.id,
        type: "reset",
        message: "Reset initiated. All services will be stopped, DB wiped, init.sql re-run, then services restarted.",
      });

      void executeResetTeardown(operation, registry, wsHub);
    },
  );

  // -------------------------------------------------------------------------
  // GET /teardown/status?operationId=xxx - Get teardown operation status
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: { operationId?: string } }>(
    "/teardown/status",
    { preHandler: verifyAuth },
    async (
      request: FastifyRequest<{ Querystring: { operationId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { operationId } = request.query;

      if (operationId) {
        const op = operations.get(operationId);
        if (!op) {
          return reply.code(404).send({
            error: "Not found",
            message: `Operation '${operationId}' not found`,
          });
        }
        return reply.code(200).send({ operation: op });
      }

      // Return all recent operations
      const allOps = Array.from(operations.values())
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 20);

      return reply.code(200).send({ operations: allOps });
    },
  );
}

// ---------------------------------------------------------------------------
// Operation helpers
// ---------------------------------------------------------------------------

function createOperation(type: TeardownType): TeardownOperation {
  const op: TeardownOperation = {
    id: crypto.randomUUID(),
    type,
    status: "pending",
    startedAt: new Date().toISOString(),
    completedAt: null,
    steps: [],
    error: null,
  };
  operations.set(op.id, op);
  return op;
}

function addStep(
  op: TeardownOperation,
  name: string,
  status: TeardownStatus,
  message: string | null,
  wsHub: WsHub,
): void {
  const step: TeardownStep = {
    name,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
  op.steps.push(step);

  wsHub.broadcast("teardown:progress", {
    operationId: op.id,
    type: op.type,
    step: step.name,
    stepStatus: step.status,
    message: step.message,
    progress: op.steps.length,
  });
}

function completeOperation(op: TeardownOperation, wsHub: WsHub, error?: string): void {
  op.status = error ? "failed" : "completed";
  op.completedAt = new Date().toISOString();
  op.error = error ?? null;

  wsHub.broadcast("teardown:progress", {
    operationId: op.id,
    type: op.type,
    status: op.status,
    error: op.error,
    completedAt: op.completedAt,
  });
}

// ---------------------------------------------------------------------------
// Teardown executors
// ---------------------------------------------------------------------------

/**
 * Soft teardown: stop all app services, keep infrastructure and data.
 */
async function executeSoftTeardown(
  op: TeardownOperation,
  registry: AgentRegistry,
  wsHub: WsHub,
): Promise<void> {
  op.status = "in_progress";

  try {
    // Stop application services in reverse dependency order
    for (const name of APP_SERVICES) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId || agent.status === "stopped") {
        addStep(op, `stop:${name}`, "completed", "Skipped (not running)", wsHub);
        continue;
      }

      try {
        addStep(op, `stop:${name}`, "in_progress", `Stopping ${name}...`, wsHub);
        await stopContainer(agent.containerId);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name });
        addStep(op, `stop:${name}`, "completed", `${name} stopped`, wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, `stop:${name}`, "failed", message, wsHub);
        logger.error({ err, name }, "Failed to stop service during soft teardown");
      }
    }

    completeOperation(op, wsHub);
    logger.info({ operationId: op.id }, "Soft teardown completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    completeOperation(op, wsHub, message);
    logger.error({ err, operationId: op.id }, "Soft teardown failed");
  }
}

/**
 * Hard teardown: stop everything and delete all containers.
 */
async function executeHardTeardown(
  op: TeardownOperation,
  registry: AgentRegistry,
  wsHub: WsHub,
): Promise<void> {
  op.status = "in_progress";

  try {
    // Stop and remove app services
    for (const name of APP_SERVICES) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId) {
        addStep(op, `remove:${name}`, "completed", "Skipped (no container)", wsHub);
        continue;
      }

      try {
        addStep(op, `remove:${name}`, "in_progress", `Stopping and removing ${name}...`, wsHub);
        await removeContainer(agent.containerId, true);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name });
        addStep(op, `remove:${name}`, "completed", `${name} removed`, wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, `remove:${name}`, "failed", message, wsHub);
        logger.error({ err, name }, "Failed to remove service during hard teardown");
      }
    }

    // Stop and remove infrastructure services
    for (const name of INFRA_SERVICES) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId) {
        addStep(op, `remove:${name}`, "completed", "Skipped (no container)", wsHub);
        continue;
      }

      try {
        addStep(op, `remove:${name}`, "in_progress", `Stopping and removing ${name}...`, wsHub);
        await removeContainer(agent.containerId, true);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name });
        addStep(op, `remove:${name}`, "completed", `${name} removed`, wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, `remove:${name}`, "failed", message, wsHub);
        logger.error({ err, name }, "Failed to remove infra service during hard teardown");
      }
    }

    // Prune stopped containers
    addStep(op, "prune", "in_progress", "Pruning stopped containers...", wsHub);
    const pruneResult = await pruneContainers();
    addStep(op, "prune", "completed", `Pruned ${pruneResult.deleted.length} containers`, wsHub);

    completeOperation(op, wsHub);
    logger.info({ operationId: op.id }, "Hard teardown completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    completeOperation(op, wsHub, message);
    logger.error({ err, operationId: op.id }, "Hard teardown failed");
  }
}

/**
 * Full teardown: stop everything, delete containers AND volumes.
 */
async function executeFullTeardown(
  op: TeardownOperation,
  registry: AgentRegistry,
  wsHub: WsHub,
): Promise<void> {
  op.status = "in_progress";

  try {
    // First do hard teardown steps (stop and remove all containers)
    for (const name of [...APP_SERVICES, ...INFRA_SERVICES]) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId) {
        addStep(op, `remove:${name}`, "completed", "Skipped (no container)", wsHub);
        continue;
      }

      try {
        addStep(op, `remove:${name}`, "in_progress", `Stopping and removing ${name}...`, wsHub);
        await removeContainer(agent.containerId, true);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name });
        addStep(op, `remove:${name}`, "completed", `${name} removed`, wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, `remove:${name}`, "failed", message, wsHub);
      }
    }

    // Prune containers
    addStep(op, "prune-containers", "in_progress", "Pruning stopped containers...", wsHub);
    const containerPrune = await pruneContainers();
    addStep(
      op,
      "prune-containers",
      "completed",
      `Pruned ${containerPrune.deleted.length} containers`,
      wsHub,
    );

    // Prune volumes (DATA LOSS!)
    addStep(op, "prune-volumes", "in_progress", "Pruning volumes (DATA LOSS!)...", wsHub);
    const volumePrune = await pruneVolumes();
    addStep(
      op,
      "prune-volumes",
      "completed",
      `Pruned ${volumePrune.deleted.length} volumes`,
      wsHub,
    );

    completeOperation(op, wsHub);
    logger.info({ operationId: op.id }, "Full teardown completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    completeOperation(op, wsHub, message);
    logger.error({ err, operationId: op.id }, "Full teardown failed");
  }
}

/**
 * Reset teardown: stop all, wipe DB, re-run init.sql, restart everything.
 */
async function executeResetTeardown(
  op: TeardownOperation,
  registry: AgentRegistry,
  wsHub: WsHub,
): Promise<void> {
  op.status = "in_progress";

  try {
    // Step 1: Stop all app services
    addStep(op, "stop-apps", "in_progress", "Stopping application services...", wsHub);

    for (const name of APP_SERVICES) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId || agent.status === "stopped") continue;

      try {
        await stopContainer(agent.containerId);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name });
      } catch (err) {
        logger.error({ err, name }, "Failed to stop service during reset");
      }
    }

    addStep(op, "stop-apps", "completed", "Application services stopped", wsHub);

    // Step 2: Wipe the database by executing SQL on the postgres container
    const postgres = registry.getAgent("postgres");
    if (postgres?.containerId && postgres.status === "running") {
      addStep(op, "wipe-db", "in_progress", "Wiping database...", wsHub);

      const dbName = process.env["POSTGRES_DB"] ?? "ondc";
      const dbUser = process.env["POSTGRES_USER"] ?? "ondc_admin";

      try {
        // Drop and recreate the database
        await execInContainer(postgres.containerId, [
          "psql",
          "-U",
          dbUser,
          "-d",
          "postgres",
          "-c",
          `DROP DATABASE IF EXISTS ${dbName};`,
        ]);

        await execInContainer(postgres.containerId, [
          "psql",
          "-U",
          dbUser,
          "-d",
          "postgres",
          "-c",
          `CREATE DATABASE ${dbName} OWNER ${dbUser};`,
        ]);

        addStep(op, "wipe-db", "completed", "Database wiped", wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, "wipe-db", "failed", `Failed to wipe DB: ${message}`, wsHub);
        logger.error({ err }, "Failed to wipe database during reset");
      }

      // Step 3: Re-run init.sql
      addStep(op, "init-db", "in_progress", "Re-running init.sql...", wsHub);

      try {
        await execInContainer(postgres.containerId, [
          "psql",
          "-U",
          dbUser,
          "-d",
          dbName,
          "-f",
          "/docker-entrypoint-initdb.d/init.sql",
        ]);
        addStep(op, "init-db", "completed", "init.sql executed", wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addStep(op, "init-db", "failed", `Failed to run init.sql: ${message}`, wsHub);
        logger.error({ err }, "Failed to run init.sql during reset");
      }
    } else {
      addStep(op, "wipe-db", "failed", "PostgreSQL container not running", wsHub);
    }

    // Step 4: Restart all app services
    addStep(op, "restart-apps", "in_progress", "Restarting application services...", wsHub);

    const startOrder = [...APP_SERVICES].reverse(); // registry first, etc.
    for (const name of startOrder) {
      const agent = registry.getAgent(name);
      if (!agent?.containerId) continue;

      try {
        await startContainer(agent.containerId);
        registry.updateAgentStatus(name, "running");
        wsHub.broadcast("service:started", { name });
        // Brief delay for dependency startup
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (err) {
        logger.error({ err, name }, "Failed to restart service during reset");
      }
    }

    addStep(op, "restart-apps", "completed", "Application services restarted", wsHub);

    completeOperation(op, wsHub);
    logger.info({ operationId: op.id }, "Reset teardown completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    completeOperation(op, wsHub, message);
    logger.error({ err, operationId: op.id }, "Reset teardown failed");
  }
}
