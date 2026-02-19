import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { WsHub } from "../services/ws-hub.js";
import {
  startContainer,
  stopContainer,
  restartContainer,
  getContainerLogs,
  getContainerStats,
} from "../services/docker-client.js";
import { verifyAuth } from "../middleware/auth.js";

const logger = createLogger("services-routes");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NameParams {
  name: string;
}

interface LogsQuery {
  tail?: string;
  since?: string;
}

export interface ServiceRoutesConfig {
  registry: AgentRegistry;
  wsHub: WsHub;
}

// ---------------------------------------------------------------------------
// Shutdown ordering for graceful stop-all / start-all
// ---------------------------------------------------------------------------

/** Order in which services should be started (infrastructure first). */
const START_ORDER = [
  "postgres",
  "redis",
  "rabbitmq",
  "registry",
  "gateway",
  "bap",
  "bpp",
  "admin",
  "docs",
  "vault",
  "mock-server",
  "health-monitor",
  "log-aggregator",
  "simulation-engine",
  "orchestrator",
];

/** Reverse order for shutdown (application services first). */
const STOP_ORDER = [...START_ORDER].reverse();

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerServiceRoutes(
  fastify: FastifyInstance,
  config: ServiceRoutesConfig,
): void {
  const { registry, wsHub } = config;

  // -------------------------------------------------------------------------
  // GET /services - List all services with status and stats
  // -------------------------------------------------------------------------
  fastify.get(
    "/services",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const agents = registry.getAllAgents();

      const services = agents.map((agent) => ({
        name: agent.name,
        type: agent.type,
        status: agent.status,
        containerId: agent.containerId,
        containerName: agent.containerName,
        uptime: agent.uptime,
        restartCount: agent.restartCount,
        stats: {
          cpu: agent.cpu,
          memory: agent.memory,
          memoryLimit: agent.memoryLimit,
          networkRx: agent.networkRx,
          networkTx: agent.networkTx,
        },
        lastHealthCheck: agent.lastHealthCheck,
      }));

      return reply.code(200).send({
        services,
        total: services.length,
        running: services.filter((s) => s.status === "running").length,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /services/:name - Get detailed info for a service
  // -------------------------------------------------------------------------
  fastify.get<{ Params: NameParams }>(
    "/services/:name",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      return reply.code(200).send({
        service: {
          name: agent.name,
          type: agent.type,
          status: agent.status,
          containerId: agent.containerId,
          containerName: agent.containerName,
          healthUrl: agent.healthUrl,
          uptime: agent.uptime,
          restartCount: agent.restartCount,
          lastHealthCheck: agent.lastHealthCheck,
          stats: {
            cpu: agent.cpu,
            memory: agent.memory,
            memoryLimit: agent.memoryLimit,
            networkRx: agent.networkRx,
            networkTx: agent.networkTx,
          },
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /services/:name/start - Start a service container
  // -------------------------------------------------------------------------
  fastify.post<{ Params: NameParams }>(
    "/services/:name/start",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      if (!agent.containerId) {
        return reply.code(400).send({
          error: "No container",
          message: `No Docker container found for service '${name}'`,
        });
      }

      try {
        await startContainer(agent.containerId);
        registry.updateAgentStatus(name, "running");
        wsHub.broadcast("service:started", { name, containerId: agent.containerId });
        logger.info({ name }, "Service started");

        return reply.code(200).send({
          success: true,
          message: `Service '${name}' started`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, name }, "Failed to start service");
        return reply.code(500).send({
          error: "Start failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /services/:name/stop - Stop a service container
  // -------------------------------------------------------------------------
  fastify.post<{ Params: NameParams }>(
    "/services/:name/stop",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      if (!agent.containerId) {
        return reply.code(400).send({
          error: "No container",
          message: `No Docker container found for service '${name}'`,
        });
      }

      try {
        await stopContainer(agent.containerId);
        registry.updateAgentStatus(name, "stopped");
        wsHub.broadcast("service:stopped", { name, containerId: agent.containerId });
        logger.info({ name }, "Service stopped");

        return reply.code(200).send({
          success: true,
          message: `Service '${name}' stopped`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, name }, "Failed to stop service");
        return reply.code(500).send({
          error: "Stop failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /services/:name/restart - Restart a service container
  // -------------------------------------------------------------------------
  fastify.post<{ Params: NameParams }>(
    "/services/:name/restart",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      if (!agent.containerId) {
        return reply.code(400).send({
          error: "No container",
          message: `No Docker container found for service '${name}'`,
        });
      }

      try {
        await restartContainer(agent.containerId);
        registry.updateAgentStatus(name, "running");
        wsHub.broadcast("service:restarted", { name, containerId: agent.containerId });
        logger.info({ name }, "Service restarted");

        return reply.code(200).send({
          success: true,
          message: `Service '${name}' restarted`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, name }, "Failed to restart service");
        return reply.code(500).send({
          error: "Restart failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /services/:name/logs?tail=100&since=3600 - Get service logs
  // -------------------------------------------------------------------------
  fastify.get<{ Params: NameParams; Querystring: LogsQuery }>(
    "/services/:name/logs",
    { preHandler: verifyAuth },
    async (
      request: FastifyRequest<{ Params: NameParams; Querystring: LogsQuery }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.params;
      const tail = parseInt(request.query.tail ?? "100", 10);
      const sinceParam = request.query.since;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      if (!agent.containerId) {
        return reply.code(400).send({
          error: "No container",
          message: `No Docker container found for service '${name}'`,
        });
      }

      try {
        const since = sinceParam
          ? Math.floor(Date.now() / 1000) - parseInt(sinceParam, 10)
          : undefined;

        const logs = await getContainerLogs(agent.containerId, tail, since);

        return reply.code(200).send({
          name,
          containerId: agent.containerId,
          tail,
          logs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, name }, "Failed to get logs");
        return reply.code(500).send({
          error: "Logs retrieval failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /services/:name/stats - Get CPU/memory/network stats
  // -------------------------------------------------------------------------
  fastify.get<{ Params: NameParams }>(
    "/services/:name/stats",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Service '${name}' is not registered`,
        });
      }

      if (!agent.containerId) {
        return reply.code(400).send({
          error: "No container",
          message: `No Docker container found for service '${name}'`,
        });
      }

      try {
        const stats = await getContainerStats(agent.containerId);

        return reply.code(200).send({
          name,
          containerId: agent.containerId,
          stats,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, name }, "Failed to get stats");
        return reply.code(500).send({
          error: "Stats retrieval failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /services/start-all - Start all services
  // -------------------------------------------------------------------------
  fastify.post(
    "/services/start-all",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const results: { name: string; success: boolean; error?: string }[] = [];

      for (const name of START_ORDER) {
        const agent = registry.getAgent(name);
        if (!agent?.containerId) {
          results.push({ name, success: false, error: "No container found" });
          continue;
        }

        if (agent.status === "running") {
          results.push({ name, success: true });
          continue;
        }

        try {
          await startContainer(agent.containerId);
          registry.updateAgentStatus(name, "running");
          wsHub.broadcast("service:started", { name, containerId: agent.containerId });
          results.push({ name, success: true });
          logger.info({ name }, "Service started (start-all)");

          // Small delay between starts to respect dependency order
          await sleep(1000);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ name, success: false, error: message });
          logger.error({ err, name }, "Failed to start service (start-all)");
        }
      }

      return reply.code(200).send({
        success: results.every((r) => r.success),
        results,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /services/stop-all - Stop all services (with dependency order)
  // -------------------------------------------------------------------------
  fastify.post(
    "/services/stop-all",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const results: { name: string; success: boolean; error?: string }[] = [];

      for (const name of STOP_ORDER) {
        // Don't stop the orchestrator itself
        if (name === "orchestrator") {
          results.push({ name, success: true });
          continue;
        }

        const agent = registry.getAgent(name);
        if (!agent?.containerId) {
          results.push({ name, success: false, error: "No container found" });
          continue;
        }

        if (agent.status === "stopped") {
          results.push({ name, success: true });
          continue;
        }

        try {
          await stopContainer(agent.containerId);
          registry.updateAgentStatus(name, "stopped");
          wsHub.broadcast("service:stopped", { name, containerId: agent.containerId });
          results.push({ name, success: true });
          logger.info({ name }, "Service stopped (stop-all)");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ name, success: false, error: message });
          logger.error({ err, name }, "Failed to stop service (stop-all)");
        }
      }

      return reply.code(200).send({
        success: results.every((r) => r.success),
        results,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
