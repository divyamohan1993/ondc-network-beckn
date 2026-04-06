import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { join } from "node:path";
import { Redis } from "ioredis";
import { ImageService } from "./services/image-service.js";
import {
  createDb,
  createLogger,
  becknErrorHandler,
  createRateLimiterMiddleware,
  createDuplicateDetector,
  createNetworkPolicyMiddleware,
  createFinderFeeValidator,
  tracingMiddleware,
  metricsMiddleware,
  globalMetrics,
  OndcMetricsReporter,
  derivePiiKey,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";
import { healthRoute } from "./routes/health.js";
import { registerActionRoutes } from "./routes/actions/index.js";
import { registerCallbackRoutes } from "./routes/callbacks/index.js";
import { registerProviderApi } from "./api/provider-api.js";
import { registerIgmRoutes } from "./routes/igm/index.js";
import { registerRspRoutes } from "./routes/rsp/index.js";
import { registerLogisticsRoutes } from "./routes/logistics/index.js";

const logger = createLogger("bpp");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BPP_PORT = parseInt(process.env["BPP_PORT"] ?? "3005", 10);
const DATABASE_URL = process.env["DATABASE_URL"];
const REDIS_URL = process.env["REDIS_URL"];

if (!DATABASE_URL || !REDIS_URL) {
  logger.error("Missing required environment variables: DATABASE_URL, REDIS_URL");
  process.exit(1);
}

// BPP identity configuration
const BPP_ID = process.env["BPP_ID"] ?? "bpp.example.com";
const BPP_URI = process.env["BPP_URI"] ?? `http://localhost:${BPP_PORT}`;
const BPP_PRIVATE_KEY = process.env["BPP_PRIVATE_KEY"] ?? "";
const BPP_UNIQUE_KEY_ID = process.env["BPP_UNIQUE_KEY_ID"] ?? "key-1";
const REGISTRY_URL =
  process.env["REGISTRY_URL"] ?? "http://localhost:3001";

// ONDC network mode: when set, BPP uses real ONDC registry for subscribe/lookup
const ONDC_REGISTRY_URL = process.env["ONDC_REGISTRY_URL"];
const registryUrl = ONDC_REGISTRY_URL || REGISTRY_URL;

// ---------------------------------------------------------------------------
// Extend Fastify instance with shared dependencies
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    redis: Redis;
    piiKey: Buffer;
    imageService: ImageService;
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

  // --- Raw body parser (stores raw string for auth signature verification) ---
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

  // --- CORS ---
  await fastify.register(cors, { origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'http://localhost:3000'] });

  // --- Multipart file upload ---
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // --- Serve uploaded images ---
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  await fastify.register(staticPlugin, {
    root: join(process.cwd(), uploadDir),
    prefix: "/uploads/",
    decorateReply: false,
  });

  // --- Image service ---
  const imageService = new ImageService(join(process.cwd(), uploadDir));
  await imageService.init();
  fastify.decorate("imageService", imageService);

  // --- PostgreSQL ---
  const { db, pool } = createDb(DATABASE_URL!);
  fastify.decorate("db", db);

  // Verify database connection at startup
  try {
    const client = await pool.connect();
    client.release();
    logger.info("PostgreSQL connected");
  } catch (err) {
    logger.error({ err }, "Failed to connect to PostgreSQL");
    throw err;
  }

  // Graceful shutdown: close pool
  fastify.addHook("onClose", async () => {
    await pool.end();
    logger.info("PostgreSQL pool closed");
  });

  // --- Redis ---
  const redis = new Redis(REDIS_URL!);
  fastify.decorate("redis", redis);

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
  redis.on("connect", () => {
    logger.info("Connected to Redis");
  });

  // Verify Redis connection at startup
  try {
    await redis.ping();
    logger.info("Redis connected");
  } catch (err) {
    logger.error({ err }, "Failed to connect to Redis");
    throw err;
  }

  fastify.addHook("onClose", async () => {
    redis.disconnect();
    logger.info("Redis disconnected");
  });

  // --- PII encryption key ---
  const piiKey = derivePiiKey(
    process.env["VAULT_MASTER_KEY"] ?? process.env["PII_ENCRYPTION_KEY"] ?? "default-dev-key",
  );
  fastify.decorate("piiKey", piiKey);

  // --- Config ---
  fastify.decorate("config", {
    bppId: BPP_ID,
    bppUri: BPP_URI,
    privateKey: BPP_PRIVATE_KEY,
    uniqueKeyId: BPP_UNIQUE_KEY_ID,
    registryUrl: registryUrl,
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
  fastify.addHook("preHandler", tracingMiddleware);
  fastify.addHook("preHandler", metricsMiddleware);
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
  await fastify.register(registerLogisticsRoutes, { prefix: "/" });

  // --- Observability endpoints ---
  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return globalMetrics.toPrometheus("ondc_bpp");
  });

  fastify.get("/metrics/json", async () => {
    return globalMetrics.getMetrics();
  });

  // --- ONDC metrics reporter ---
  const metricsUrl = process.env["ONDC_METRICS_URL"];
  if (metricsUrl) {
    const reporter = new OndcMetricsReporter({
      reportingUrl: metricsUrl,
      subscriberId: BPP_ID,
      subscriberType: "BPP",
    });
    reporter.start(globalMetrics);

    fastify.addHook("onClose", async () => {
      reporter.stop();
    });
  }

  // --- Start ---
  await fastify.listen({ port: BPP_PORT, host: "0.0.0.0" });
  logger.info(`BPP Protocol Adapter listening on port ${BPP_PORT}`);

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    await fastify.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start BPP server");
  process.exit(1);
});
