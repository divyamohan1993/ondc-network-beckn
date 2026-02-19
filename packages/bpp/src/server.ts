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
  createFinderFeeValidator,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";
import { healthRoute } from "./routes/health.js";
import { registerActionRoutes } from "./routes/actions/index.js";
import { registerCallbackRoutes } from "./routes/callbacks/index.js";
import { registerProviderApi } from "./api/provider-api.js";
import { registerIgmRoutes } from "./routes/igm/index.js";
import { registerRspRoutes } from "./routes/rsp/index.js";

const logger = createLogger("bpp");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BPP_PORT = parseInt(process.env["BPP_PORT"] ?? "3005", 10);
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://ondc:ondc@localhost:5432/ondc_network";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

// BPP identity configuration
const BPP_ID = process.env["BPP_ID"] ?? "bpp.example.com";
const BPP_URI = process.env["BPP_URI"] ?? `http://localhost:${BPP_PORT}`;
const BPP_PRIVATE_KEY = process.env["BPP_PRIVATE_KEY"] ?? "";
const BPP_UNIQUE_KEY_ID = process.env["BPP_UNIQUE_KEY_ID"] ?? "key-1";
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
      bppId: string;
      bppUri: string;
      privateKey: string;
      uniqueKeyId: string;
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
    bppId: BPP_ID,
    bppUri: BPP_URI,
    privateKey: BPP_PRIVATE_KEY,
    uniqueKeyId: BPP_UNIQUE_KEY_ID,
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

  // Finder fee validation (ONDC mandated for select/init/confirm on BPP)
  const finderFeeValidator = createFinderFeeValidator({
    enforceSettlement: true,
  });

  // Apply middleware globally to all Beckn protocol routes
  fastify.addHook("preHandler", rateLimiter);
  fastify.addHook("preHandler", duplicateDetector);
  fastify.addHook("preHandler", networkPolicy);
  fastify.addHook("preHandler", finderFeeValidator);

  // --- Routes ---
  await fastify.register(healthRoute);
  await fastify.register(registerActionRoutes, { prefix: "/" });
  await fastify.register(registerCallbackRoutes, { prefix: "/" });
  await fastify.register(registerProviderApi, { prefix: "/api" });
  await fastify.register(registerIgmRoutes, { prefix: "/" });
  await fastify.register(registerRspRoutes, { prefix: "/" });

  // --- Start ---
  await fastify.listen({ port: BPP_PORT, host: "0.0.0.0" });
  logger.info(`BPP Protocol Adapter listening on port ${BPP_PORT}`);
}

main().catch((err) => {
  logger.error({ err }, "Failed to start BPP server");
  process.exit(1);
});
