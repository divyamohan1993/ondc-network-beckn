import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Register the GET /health route for the log-aggregator service itself.
 */
export function registerHealthRoute(fastify: FastifyInstance): void {
  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      status: "ok",
      service: "log-aggregator",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
    });
  });
}
