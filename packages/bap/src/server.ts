import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import {
  createDb,
  createLogger,
  becknErrorHandler,
  createRateLimiterMiddleware,
  createDuplicateDetector,
  createNetworkPolicyMiddleware,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";
import { healthRoute } from "./routes/health.js";
import { registerActionRoutes } from "./routes/actions/index.js";
import { registerCallbackRoutes } from "./routes/callbacks/index.js";
import { registerClientApi } from "./api/client-api.js";
import { registerIgmRoutes } from "./routes/igm/index.js";
import { registerRspRoutes } from "./routes/rsp/index.js";

const logger = createLogger("bap");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BAP_PORT = parseInt(process.env["BAP_PORT"] ?? "3004", 10);
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://ondc:ondc@localhost:5432/ondc_network";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

// BAP identity configuration
const BAP_ID = process.env["BAP_ID"] ?? "bap.example.com";
const BAP_URI = process.env["BAP_URI"] ?? `http://localhost:${BAP_PORT}`;
const BAP_PRIVATE_KEY = process.env["BAP_PRIVATE_KEY"] ?? "";
const BAP_UNIQUE_KEY_ID = process.env["BAP_UNIQUE_KEY_ID"] ?? "key-1";
const GATEWAY_URL =
  process.env["GATEWAY_URL"] ?? "http://localhost:3002";
const REGISTRY_URL =
  process.env["REGISTRY_URL"] ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Extend Fastify instance with shared dependencies
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    redis: Redis;
    config: {
      bapId: string;
      bapUri: string;
      privateKey: string;
      uniqueKeyId: string;
      gatewayUrl: string;
      registryUrl: string;
    };
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const fastify = Fastify({
    logger: false, // we use our own pino logger
  });

  // --- CORS ---
  await fastify.register(cors, { origin: true });

  // --- PostgreSQL ---
  const { db, pool } = createDb(DATABASE_URL);
  fastify.decorate("db", db);

  // Graceful shutdown: close pool
  fastify.addHook("onClose", async () => {
    await pool.end();
    logger.info("PostgreSQL pool closed");
  });

  // --- Redis ---
  const redis = new Redis(REDIS_URL);
  fastify.decorate("redis", redis);

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
  redis.on("connect", () => {
    logger.info("Connected to Redis");
  });

  fastify.addHook("onClose", async () => {
    redis.disconnect();
    logger.info("Redis disconnected");
  });

  // --- Config ---
  fastify.decorate("config", {
    bapId: BAP_ID,
    bapUri: BAP_URI,
    privateKey: BAP_PRIVATE_KEY,
    uniqueKeyId: BAP_UNIQUE_KEY_ID,
    gatewayUrl: GATEWAY_URL,
    registryUrl: REGISTRY_URL,
  });

  // --- Error handler ---
  fastify.setErrorHandler(becknErrorHandler);

  // --- ONDC Compliance Middleware ---
  // Rate limiting per subscriber (ONDC mandated)
  const rateLimiter = createRateLimiterMiddleware({
    redisClient: redis,
    maxRequests: parseInt(process.env["RATE_LIMIT_MAX"] ?? "100", 10),
    windowSeconds: parseInt(process.env["RATE_LIMIT_WINDOW"] ?? "60", 10),
  });

  // Duplicate message_id detection (ONDC spec: each message_id must be unique)
  const duplicateDetector = createDuplicateDetector({
    redisClient: redis,
    ttlSeconds: parseInt(process.env["DEDUP_TTL"] ?? "300", 10),
  });

  // Network policy enforcement (SLA headers, domain restrictions)
  const networkPolicy = createNetworkPolicyMiddleware({
    redisClient: redis,
    enforceSla: true,
    enforceTags: true,
  });

  // Apply middleware globally to all Beckn protocol routes
  fastify.addHook("preHandler", rateLimiter);
  fastify.addHook("preHandler", duplicateDetector);
  fastify.addHook("preHandler", networkPolicy);

  // --- Routes ---
  await fastify.register(healthRoute);
  await fastify.register(registerActionRoutes, { prefix: "/" });
  await fastify.register(registerCallbackRoutes, { prefix: "/" });
  await fastify.register(registerClientApi, { prefix: "/api" });
  await fastify.register(registerIgmRoutes, { prefix: "/" });
  await fastify.register(registerRspRoutes, { prefix: "/" });

  // --- Start ---
  await fastify.listen({ port: BAP_PORT, host: "0.0.0.0" });
  logger.info(`BAP Protocol Adapter listening on port ${BAP_PORT}`);
}

main().catch((err) => {
  logger.error({ err }, "Failed to start BAP server");
  process.exit(1);
});
