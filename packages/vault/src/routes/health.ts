import type { FastifyInstance } from "fastify";

/**
 * Health check route plugin.
 * GET /health returns service health information.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      service: "vault",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
    });
  });
}
