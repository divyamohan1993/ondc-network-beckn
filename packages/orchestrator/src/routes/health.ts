import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { WsHub } from "../services/ws-hub.js";

export interface HealthRouteConfig {
  registry: AgentRegistry;
  wsHub: WsHub;
}

/**
 * Register the GET /health route on the Fastify instance.
 *
 * Returns a health check response with service metadata,
 * agent summary, and WebSocket client count.
 */
export function registerHealthRoute(
  fastify: FastifyInstance,
  config: HealthRouteConfig,
): void {
  const { registry, wsHub } = config;

  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const summary = registry.getSummary();

    return reply.code(200).send({
      status: "ok",
      service: "orchestrator",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
      agents: {
        total: summary.total,
        running: summary.running,
        stopped: summary.stopped,
        unhealthy: summary.unhealthy,
      },
      wsClients: wsHub.getClientCount(),
    });
  });
}
