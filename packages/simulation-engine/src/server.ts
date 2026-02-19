import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { createDb } from "@ondc/shared/db";

import { SimulationEngine } from "./services/engine.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerSimulationRoutes } from "./routes/simulation.js";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("simulation-engine");

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["SIMULATION_ENGINE_PORT"] ?? "3011", 10);
const HOST = process.env["SIMULATION_ENGINE_HOST"] ?? "0.0.0.0";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://ondc:ondc@localhost:5432/ondc_network";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const INTERNAL_API_KEY = process.env["INTERNAL_API_KEY"] ?? "";

const GATEWAY_URL = process.env["GATEWAY_URL"] ?? "http://localhost:3002";
const REGISTRY_URL = process.env["REGISTRY_URL"] ?? "http://localhost:3001";
const MOCK_SERVER_URL = process.env["MOCK_SERVER_URL"] ?? "http://localhost:3010";

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
  // Initialize Simulation Engine
  // -------------------------------------------------------------------------
  const engine = new SimulationEngine(db, redis, {
    gatewayUrl: GATEWAY_URL,
    registryUrl: REGISTRY_URL,
    mockServerUrl: MOCK_SERVER_URL,
  });

  // -------------------------------------------------------------------------
  // Register routes
  // -------------------------------------------------------------------------
  registerHealthRoute(fastify);
  registerSimulationRoutes(fastify, engine);

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "Simulation Engine server started");

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down simulation engine...");

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

    logger.info("Simulation engine shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Simulation engine failed to start");
  process.exit(1);
});
