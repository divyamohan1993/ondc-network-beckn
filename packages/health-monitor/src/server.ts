import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { createDb } from "@ondc/shared/db";

import { HealthMonitor } from "./services/monitor.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerStatusRoutes } from "./routes/status.js";
import { EscalationService, SettlementService } from "@ondc/shared/services";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("health-monitor");

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["HEALTH_MONITOR_PORT"] ?? "3008", 10);
const HOST = process.env["HEALTH_MONITOR_HOST"] ?? "0.0.0.0";

const DATABASE_URL = process.env["DATABASE_URL"];
const REDIS_URL = process.env["REDIS_URL"];

if (!DATABASE_URL || !REDIS_URL) {
  logger.error("Missing required environment variables: DATABASE_URL, REDIS_URL");
  process.exit(1);
}

const INTERNAL_API_KEY = process.env["INTERNAL_API_KEY"] ?? "";
if (!INTERNAL_API_KEY && process.env["NODE_ENV"] === "production") {
  logger.error("INTERNAL_API_KEY is required in production mode");
  process.exit(1);
}

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
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'http://localhost:3000'],
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  });

  // -------------------------------------------------------------------------
  // Authentication middleware
  // -------------------------------------------------------------------------
  fastify.addHook("onRequest", async (request, reply) => {
    // Skip auth for health endpoint
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
  const { db, pool } = createDb(DATABASE_URL!);

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

  // -------------------------------------------------------------------------
  // Initialize Health Monitor
  // -------------------------------------------------------------------------
  const checkInterval = parseInt(process.env["CHECK_INTERVAL_MS"] ?? "15000", 10);
  const responseThreshold = parseInt(process.env["RESPONSE_THRESHOLD_MS"] ?? "5000", 10);

  const monitor = new HealthMonitor(db, redis, undefined, {
    checkIntervalMs: checkInterval,
    responseTimeThresholdMs: responseThreshold,
  });

  // -------------------------------------------------------------------------
  // Register routes
  // -------------------------------------------------------------------------
  registerHealthRoute(fastify);
  registerStatusRoutes(fastify, monitor);

  // -------------------------------------------------------------------------
  // Start monitoring loop
  // -------------------------------------------------------------------------
  monitor.start();

  // -------------------------------------------------------------------------
  // Start IGM escalation auto-check (every 60 seconds)
  // -------------------------------------------------------------------------
  const escalationService = new EscalationService(db, async (issueId, newLevel, deadline) => {
    await redis.publish("ondc:escalation", JSON.stringify({ issueId, newLevel, deadline, timestamp: new Date().toISOString() }));
    logger.warn({ issueId, newLevel, deadline }, "Issue auto-escalated, notification published");
  });
  const escalationInterval = setInterval(() => {
    escalationService.checkAndAutoEscalate().catch((err) => {
      logger.error({ err }, "IGM auto-escalation check failed");
    });
  }, 60_000);
  // Run once immediately at startup
  escalationService.checkAndAutoEscalate().catch((err) => {
    logger.error({ err }, "IGM auto-escalation initial check failed");
  });

  // -------------------------------------------------------------------------
  // Start settlement withholding release (every hour)
  // -------------------------------------------------------------------------
  const settlementService = new SettlementService(db);
  const withholdingInterval = setInterval(async () => {
    try {
      const released = await settlementService.releaseExpiredWithholdings();
      if (released > 0) {
        logger.info({ released }, "Released expired withholdings");
      }
    } catch (err) {
      logger.error({ err }, "Failed to release expired withholdings");
    }
  }, 3_600_000);
  // Run once immediately at startup
  settlementService.releaseExpiredWithholdings().catch((err) => {
    logger.error({ err }, "Initial withholding release check failed");
  });

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "Health Monitor server started");

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down health monitor...");

    // Stop monitoring loop, escalation timer, and withholding timer
    monitor.stop();
    clearInterval(escalationInterval);
    clearInterval(withholdingInterval);

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

    logger.info("Health monitor shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Health monitor failed to start");
  process.exit(1);
});
