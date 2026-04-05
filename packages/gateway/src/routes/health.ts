import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ChannelModel } from "amqplib";
import type { Redis } from "ioredis";
import type { Database } from "@ondc/shared";
import { sql } from "drizzle-orm";

export interface HealthRouteConfig {
  rabbitConnection: ChannelModel;
  db: Database;
  redis: Redis;
}

/**
 * Register GET /health and GET /readiness routes on the Fastify instance.
 *
 * /health returns a health check response with service metadata and
 * backend connectivity status for PostgreSQL, Redis, and RabbitMQ.
 *
 * /readiness returns 200 only when all dependencies are fully connected.
 */
export function registerHealthRoute(
  fastify: FastifyInstance,
  config: HealthRouteConfig,
): void {
  const { rabbitConnection, db, redis } = config;

  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, string> = {};

    // DB check
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Redis check
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    // RabbitMQ check
    try {
      const ch = await rabbitConnection.createChannel();
      await ch.close();
      checks.rabbitmq = "ok";
    } catch {
      checks.rabbitmq = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      service: "gateway",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  fastify.get("/readiness", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await db.execute(sql`SELECT 1`);
      await redis.ping();
      // Verify RabbitMQ by opening and closing a channel
      const ch = await rabbitConnection.createChannel();
      await ch.close();
      return reply.code(200).send({ ready: true });
    } catch (err) {
      return reply.code(503).send({ ready: false, error: (err as Error).message });
    }
  });
}
