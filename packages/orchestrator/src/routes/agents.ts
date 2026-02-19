import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { WsHub } from "../services/ws-hub.js";
import { verifyAuth } from "../middleware/auth.js";

const logger = createLogger("agents-routes");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NameParams {
  name: string;
}

export interface AgentRoutesConfig {
  registry: AgentRegistry;
  wsHub: WsHub;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAgentRoutes(
  fastify: FastifyInstance,
  config: AgentRoutesConfig,
): void {
  const { registry, wsHub } = config;

  // -------------------------------------------------------------------------
  // GET /agents - List all registered agents
  // -------------------------------------------------------------------------
  fastify.get(
    "/agents",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const agents = registry.getAllAgents();

      return reply.code(200).send({
        agents: agents.map((a) => ({
          name: a.name,
          type: a.type,
          status: a.status,
          containerId: a.containerId,
          containerName: a.containerName,
          healthUrl: a.healthUrl,
          lastHealthCheck: a.lastHealthCheck,
          uptime: a.uptime,
          restartCount: a.restartCount,
          stats: {
            cpu: a.cpu,
            memory: a.memory,
            memoryLimit: a.memoryLimit,
            networkRx: a.networkRx,
            networkTx: a.networkTx,
          },
        })),
        total: agents.length,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /agents/:name/health - Check health of specific agent
  // -------------------------------------------------------------------------
  fastify.get<{ Params: NameParams }>(
    "/agents/:name/health",
    { preHandler: verifyAuth },
    async (request: FastifyRequest<{ Params: NameParams }>, reply: FastifyReply) => {
      const { name } = request.params;
      const agent = registry.getAgent(name);

      if (!agent) {
        return reply.code(404).send({
          error: "Not found",
          message: `Agent '${name}' is not registered`,
        });
      }

      const result = await registry.checkHealth(agent);

      // Broadcast the health check result
      wsHub.broadcast("agent:health", result);

      return reply.code(200).send(result);
    },
  );

  // -------------------------------------------------------------------------
  // POST /agents/health-check - Run health checks on all agents
  // -------------------------------------------------------------------------
  fastify.post(
    "/agents/health-check",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      logger.info("Running health checks on all agents");

      const results = await registry.runHealthChecks();

      // Broadcast all results
      for (const result of results) {
        wsHub.broadcast("agent:health", result);
      }

      const healthy = results.filter((r) => r.healthy).length;
      const unhealthy = results.filter((r) => !r.healthy).length;

      return reply.code(200).send({
        results,
        summary: {
          total: results.length,
          healthy,
          unhealthy,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /agents/summary - Get summary (total, running, stopped, unhealthy)
  // -------------------------------------------------------------------------
  fastify.get(
    "/agents/summary",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const summary = registry.getSummary();

      return reply.code(200).send({
        summary,
        timestamp: new Date().toISOString(),
      });
    },
  );
}
