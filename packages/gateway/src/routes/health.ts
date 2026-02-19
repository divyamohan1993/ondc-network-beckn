import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ChannelModel } from "amqplib";

export interface HealthRouteConfig {
  rabbitConnection: ChannelModel;
}

/**
 * Register the GET /health route on the Fastify instance.
 *
 * Returns a health check response with service metadata and
 * RabbitMQ connection status.
 */
export function registerHealthRoute(
  fastify: FastifyInstance,
  config: HealthRouteConfig,
): void {
  const { rabbitConnection } = config;

  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    let rabbitStatus: "connected" | "disconnected" = "disconnected";

    try {
      // amqplib Connection does not expose a direct "isOpen" property.
      // If the connection is closed, accessing the channel or any method
      // on it would throw. We use a simple check here.
      if (rabbitConnection) {
        rabbitStatus = "connected";
      }
    } catch {
      rabbitStatus = "disconnected";
    }

    return reply.code(200).send({
      status: "ok",
      service: "gateway",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
      rabbitmq: rabbitStatus,
    });
  });
}
