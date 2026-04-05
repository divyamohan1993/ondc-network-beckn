import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";

/**
 * Health check and readiness endpoints for the BAP Protocol Adapter.
 * /health verifies DB and Redis connectivity, returns degraded status on failure.
 * /readiness returns 200 only when all dependencies are fully connected.
 */
export const healthRoute: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get("/health", async (_request, reply) => {
    const checks: Record<string, string> = {};

    // DB check
    try {
      await fastify.db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Redis check
    try {
      await fastify.redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      service: "bap-protocol-adapter",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get("/readiness", async (_request, reply) => {
    try {
      await fastify.db.execute(sql`SELECT 1`);
      await fastify.redis.ping();
      return reply.code(200).send({ ready: true });
    } catch (err) {
      return reply.code(503).send({ ready: false, error: (err as Error).message });
    }
  });
};
