import type { FastifyInstance, FastifyPluginAsync } from "fastify";

/**
 * Health check endpoint for the BAP Protocol Adapter.
 * Returns service status, uptime, and timestamp.
 */
export const healthRoute: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get("/health", async (_request, _reply) => {
    return {
      status: "ok",
      service: "bap-protocol-adapter",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
};
