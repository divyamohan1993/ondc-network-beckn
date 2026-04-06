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
  tracingMiddleware,
  metricsMiddleware,
  globalMetrics,
  OndcMetricsReporter,
  derivePiiKey,
  NotificationService,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";
import { healthRoute } from "./routes/health.js";
import { registerActionRoutes } from "./routes/actions/index.js";
import { registerCallbackRoutes } from "./routes/callbacks/index.js";
import { registerClientApi } from "./api/client-api.js";
import { registerIgmRoutes } from "./routes/igm/index.js";
import { registerRspRoutes } from "./routes/rsp/index.js";
import { registerPaymentRoutes } from "./routes/payment.js";
import { ActionQueueService } from "./services/action-queue.js";

const logger = createLogger("bap");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BAP_PORT = parseInt(process.env["BAP_PORT"] ?? "3004", 10);
const DATABASE_URL = process.env["DATABASE_URL"];
const REDIS_URL = process.env["REDIS_URL"];
const RABBITMQ_URL = process.env["RABBITMQ_URL"];

if (!DATABASE_URL || !REDIS_URL) {
  logger.error("Missing required environment variables: DATABASE_URL, REDIS_URL");
  process.exit(1);
}

// BAP identity configuration
const BAP_ID = process.env["BAP_ID"] ?? "bap.example.com";
const BAP_URI = process.env["BAP_URI"] ?? `http://localhost:${BAP_PORT}`;
const BAP_PRIVATE_KEY = process.env["BAP_PRIVATE_KEY"] ?? "";
const BAP_UNIQUE_KEY_ID = process.env["BAP_UNIQUE_KEY_ID"] ?? "key-1";
const GATEWAY_URL =
  process.env["GATEWAY_URL"] ?? "http://localhost:3002";
const REGISTRY_URL =
  process.env["REGISTRY_URL"] ?? "http://localhost:3001";

// ONDC network mode: when set, BAP uses real ONDC registry/gateway for subscribe/lookup
const ONDC_REGISTRY_URL = process.env["ONDC_REGISTRY_URL"];
const ONDC_GATEWAY_URL = process.env["ONDC_GATEWAY_URL"];
const registryUrl = ONDC_REGISTRY_URL || REGISTRY_URL;
const gatewayUrl = ONDC_GATEWAY_URL || GATEWAY_URL;

// ---------------------------------------------------------------------------
// Extend Fastify instance with shared dependencies
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    redis: Redis;
    piiKey: Buffer;
    notifications: NotificationService;
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

  // --- Notification Service ---
  const smtpHost = process.env["SMTP_HOST"];
  const smsProvider = process.env["SMS_PROVIDER"] as "msg91" | "twilio" | "mock" | undefined;
  const notificationService = new NotificationService({
    email: smtpHost
      ? {
          host: smtpHost,
          port: parseInt(process.env["SMTP_PORT"] ?? "587", 10),
          secure: process.env["SMTP_SECURE"] === "true",
          user: process.env["SMTP_USER"] ?? "",
          pass: process.env["SMTP_PASS"] ?? "",
          from: process.env["SMTP_FROM"] ?? "noreply@ondc.example.com",
        }
      : undefined,
    sms: smsProvider
      ? {
          provider: smsProvider,
          apiKey: process.env["SMS_API_KEY"] ?? "",
          senderId: process.env["SMS_SENDER_ID"] ?? "ONDCSM",
          templateId: process.env["SMS_TEMPLATE_ID"],
          accountSid: process.env["TWILIO_ACCOUNT_SID"],
          authToken: process.env["TWILIO_AUTH_TOKEN"],
          fromNumber: process.env["TWILIO_FROM_NUMBER"],
        }
      : undefined,
  });
  notificationService.startRetryProcessor();
  fastify.decorate("notifications", notificationService);

  fastify.addHook("onClose", async () => {
    notificationService.stopRetryProcessor();
    logger.info("Notification retry processor stopped");
  });

  // --- Action Queue (RabbitMQ) ---
  let actionQueue: ActionQueueService | undefined;
  if (RABBITMQ_URL) {
    try {
      actionQueue = new ActionQueueService(RABBITMQ_URL);
      await actionQueue.init();
      await actionQueue.startConsumer();
      (fastify as any).actionQueue = actionQueue;

      fastify.addHook("onClose", async () => {
        await actionQueue!.close();
        logger.info("Action queue closed");
      });

      logger.info("Action queue initialized with RabbitMQ");
    } catch (err) {
      logger.warn({ err }, "RabbitMQ not available, actions will be sent directly to BPPs");
    }
  } else {
    logger.info("RABBITMQ_URL not set, actions will be sent directly to BPPs");
  }

  // --- Config ---
  fastify.decorate("config", {
    bapId: BAP_ID,
    bapUri: BAP_URI,
    privateKey: BAP_PRIVATE_KEY,
    uniqueKeyId: BAP_UNIQUE_KEY_ID,
    gatewayUrl: gatewayUrl,
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

  // Apply middleware globally to all Beckn protocol routes
  fastify.addHook("preHandler", tracingMiddleware);
  fastify.addHook("preHandler", metricsMiddleware);
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
  await fastify.register(registerPaymentRoutes, { prefix: "/" });

  // --- Observability endpoints ---
  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return globalMetrics.toPrometheus("ondc_bap");
  });

  fastify.get("/metrics/json", async () => {
    return globalMetrics.getMetrics();
  });

  // --- ONDC metrics reporter ---
  const metricsUrl = process.env["ONDC_METRICS_URL"];
  if (metricsUrl) {
    const reporter = new OndcMetricsReporter({
      reportingUrl: metricsUrl,
      subscriberId: BAP_ID,
      subscriberType: "BAP",
    });
    reporter.start(globalMetrics);

    fastify.addHook("onClose", async () => {
      reporter.stop();
    });
  }

  // --- Start ---
  await fastify.listen({ port: BAP_PORT, host: "0.0.0.0" });
  logger.info(`BAP Protocol Adapter listening on port ${BAP_PORT}`);

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
  logger.error({ err }, "Failed to start BAP server");
  process.exit(1);
});
