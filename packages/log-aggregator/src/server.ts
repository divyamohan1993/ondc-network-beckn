import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { createDb } from "@ondc/shared/db";

import { LogCollector } from "./services/collector.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerLogRoutes } from "./routes/logs.js";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("log-aggregator");

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["LOG_AGGREGATOR_PORT"] ?? "3009", 10);
const HOST = process.env["LOG_AGGREGATOR_HOST"] ?? "0.0.0.0";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://ondc:ondc@localhost:5432/ondc_network";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const INTERNAL_API_KEY = process.env["INTERNAL_API_KEY"] ?? "";
const RETENTION_DAYS = parseInt(process.env["LOG_RETENTION_DAYS"] ?? "30", 10);

// ---------------------------------------------------------------------------
// Main startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Create Fastify instance
  // -------------------------------------------------------------------------
  const fastify = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      timestamp: true,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  // -------------------------------------------------------------------------
  // Authentication middleware
  // -------------------------------------------------------------------------
  fastify.addHook("onRequest", async (request, reply) => {
    // Skip auth for health endpoint and SSE stream
    if (request.url === "/health") return;

    if (INTERNAL_API_KEY) {
      const providedKey = request.headers["x-internal-api-key"];
      if (providedKey !== INTERNAL_API_KEY) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid or missing x-internal-api-key header",
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Connect to PostgreSQL via Drizzle
  // -------------------------------------------------------------------------
  logger.info("Connecting to PostgreSQL...");
  const { db, pool } = createDb(DATABASE_URL);

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
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    lazyConnect: true,
  });

  await redis.connect();
  logger.info("Redis connected");

  // -------------------------------------------------------------------------
  // Initialize Log Collector
  // -------------------------------------------------------------------------
  const collector = new LogCollector(db, redis, RETENTION_DAYS);
  await collector.start();

  // -------------------------------------------------------------------------
  // Register routes
  // -------------------------------------------------------------------------
  registerHealthRoute(fastify);
  registerLogRoutes(fastify, collector);

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "Log Aggregator server started");

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down log aggregator...");

    // Stop collector first (flushes remaining buffer)
    await collector.stop();

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
      logger.info("PostgreSQL pool closed");
    } catch (err) {
      logger.error({ err }, "Error closing PostgreSQL pool");
    }

    logger.info("Log aggregator shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Log aggregator failed to start");
  process.exit(1);
});
