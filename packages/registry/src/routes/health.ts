import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

/**
 * Health check and readiness route plugins.
 * GET /health returns service health with backend connectivity status.
 * GET /readiness returns 200 only when all dependencies are connected.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
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
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      service: "registry",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  fastify.get("/readiness", async (_request, reply) => {
    try {
      await fastify.db.execute(sql`SELECT 1`);
      await fastify.redis.ping();
      return reply.status(200).send({ ready: true });
    } catch (err) {
      return reply.status(503).send({ ready: false, error: (err as Error).message });
    }
  });
}
