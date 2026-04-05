import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { createDb, type Database } from "@ondc/shared/db";
import { tracingMiddleware, metricsMiddleware } from "@ondc/shared/middleware";
import { globalMetrics } from "@ondc/shared/services";

import { healthRoutes } from "./routes/health.js";
import { subscribeRoutes } from "./routes/subscribe.js";
import { onSubscribeRoutes } from "./routes/on-subscribe.js";
import { lookupRoutes } from "./routes/lookup.js";
import { internalRoutes } from "./routes/internal.js";
import { siteVerificationRoutes } from "./routes/site-verification.js";
import { dataErasureRoutes } from "./routes/data-erasure.js";

// ---------------------------------------------------------------------------
// Fastify type augmentation for decorated properties
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    redis: Redis;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["REGISTRY_PORT"] ?? "3001", 10);
const HOST = process.env["REGISTRY_HOST"] ?? "0.0.0.0";
// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("registry");

const DATABASE_URL = process.env["DATABASE_URL"];
const REDIS_URL = process.env["REDIS_URL"];

if (!DATABASE_URL || !REDIS_URL) {
  logger.error("Missing required environment variables: DATABASE_URL, REDIS_URL");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
// NOTE: Run `pnpm db:migrate` (or `pnpm --filter shared db:migrate`) before
// first start to apply all pending database migrations.

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Create Fastify instance
  // -------------------------------------------------------------------------
  const fastify = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // -------------------------------------------------------------------------
  // Raw body parser (stores raw string for auth signature verification)
  // -------------------------------------------------------------------------
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        (req as any).rawBody = body as string;
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Register CORS
  // -------------------------------------------------------------------------
  await fastify.register(cors, {
    origin: process.env["CORS_ALLOWED_ORIGINS"]?.split(',') || [process.env["DOMAIN"] ? `https://${process.env["DOMAIN"]}` : 'http://localhost:3000'],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-internal-api-key"],
  });

  // -------------------------------------------------------------------------
  // Connect to PostgreSQL via Drizzle
  // -------------------------------------------------------------------------
  logger.info("Connecting to PostgreSQL...");
  const { db, pool } = createDb(DATABASE_URL!);
  fastify.decorate("db", db);

  // Verify database connection
  try {
    const client = await pool.connect();
    client.release();
    logger.info("PostgreSQL connected");
  } catch (err) {
    logger.error({ err }, "Failed to connect to PostgreSQL");
    throw err;
  }

  // -------------------------------------------------------------------------
  // Connect to Redis
  // -------------------------------------------------------------------------
  logger.info("Connecting to Redis...");
  const redis = new Redis(REDIS_URL!, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    lazyConnect: true,
  });

  await redis.connect();
  logger.info("Redis connected");
  fastify.decorate("redis", redis);

  // -------------------------------------------------------------------------
  // Distributed tracing
  // -------------------------------------------------------------------------
  fastify.addHook("preHandler", tracingMiddleware);
  fastify.addHook("preHandler", metricsMiddleware);

  // -------------------------------------------------------------------------
  // Register route plugins
  // -------------------------------------------------------------------------
  await fastify.register(healthRoutes);
  await fastify.register(subscribeRoutes);
  await fastify.register(onSubscribeRoutes);
  await fastify.register(lookupRoutes);
  await fastify.register(internalRoutes);
  await fastify.register(siteVerificationRoutes);
  await fastify.register(dataErasureRoutes);

  // -------------------------------------------------------------------------
  // Observability endpoints
  // -------------------------------------------------------------------------
  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return globalMetrics.toPrometheus("ondc_registry");
  });

  fastify.get("/metrics/json", async () => {
    return globalMetrics.getMetrics();
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Received shutdown signal, closing gracefully...");

    try {
      await fastify.close();
      logger.info("Fastify server closed");
    } catch (err) {
      logger.error({ err }, "Error closing Fastify");
    }

    try {
      redis.disconnect();
      logger.info("Redis disconnected");
    } catch (err) {
      logger.error({ err }, "Error disconnecting Redis");
    }

    try {
      await pool.end();
      logger.info("PostgreSQL pool ended");
    } catch (err) {
      logger.error({ err }, "Error ending PostgreSQL pool");
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // -------------------------------------------------------------------------
  // Start listening
  // -------------------------------------------------------------------------
  try {
    await fastify.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, host: HOST }, "ONDC Registry service started");
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error during startup");
  process.exit(1);
});
