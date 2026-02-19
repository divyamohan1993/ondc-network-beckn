import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import amqplib from "amqplib";
import Redis from "ioredis";
import {
  createDb,
  RegistryClient,
  createLogger,
  becknErrorHandler,
  createRateLimiterMiddleware,
  createDuplicateDetector,
  createNetworkPolicyMiddleware,
} from "@ondc/shared";

import { DiscoveryService } from "./services/discovery.js";
import { MulticastService } from "./services/multicast.js";
import { ResponseAggregator } from "./services/response-agg.js";
import { registerSearchRoute } from "./routes/search.js";
import { registerOnSearchRoute } from "./routes/on-search.js";
import { registerHealthRoute } from "./routes/health.js";

const logger = createLogger("gateway");

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["GATEWAY_PORT"] ?? "3002", 10);
const HOST = process.env["GATEWAY_HOST"] ?? "0.0.0.0";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/ondc";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const RABBITMQ_URL = process.env["RABBITMQ_URL"] ?? "amqp://guest:guest@localhost:5672";
const REGISTRY_URL = process.env["REGISTRY_URL"] ?? "http://localhost:3001";

const GATEWAY_PRIVATE_KEY = process.env["GATEWAY_PRIVATE_KEY"] ?? "";
const GATEWAY_SUBSCRIBER_ID = process.env["GATEWAY_SUBSCRIBER_ID"] ?? "";
const GATEWAY_KEY_ID = process.env["GATEWAY_KEY_ID"] ?? "";

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
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Set Beckn error handler
  fastify.setErrorHandler(becknErrorHandler);

  // -------------------------------------------------------------------------
  // Connect to PostgreSQL via Drizzle
  // -------------------------------------------------------------------------
  logger.info("Connecting to PostgreSQL...");
  const { db, pool } = createDb(DATABASE_URL);
  logger.info("PostgreSQL connected");

  // -------------------------------------------------------------------------
  // Connect to Redis
  // -------------------------------------------------------------------------
  logger.info("Connecting to Redis...");
  const redis = new Redis(REDIS_URL);

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  // -------------------------------------------------------------------------
  // Connect to RabbitMQ
  // -------------------------------------------------------------------------
  logger.info("Connecting to RabbitMQ...");
  const rabbitConnection = await amqplib.connect(RABBITMQ_URL);

  rabbitConnection.on("error", (err) => {
    logger.error({ err }, "RabbitMQ connection error");
  });

  rabbitConnection.on("close", () => {
    logger.warn("RabbitMQ connection closed");
  });

  logger.info("RabbitMQ connected");

  // -------------------------------------------------------------------------
  // Initialize services
  // -------------------------------------------------------------------------
  const registryClient = new RegistryClient(REGISTRY_URL, redis);
  const discoveryService = new DiscoveryService(registryClient);
  const multicastService = new MulticastService(rabbitConnection);
  const responseAggregator = new ResponseAggregator();

  // Initialize multicast (assert exchange, queue, bindings)
  await multicastService.init();

  // Start the search fan-out consumer
  await multicastService.startConsumer((error, bppUrl, transactionId) => {
    logger.error(
      { error: error.message, bppUrl, transactionId },
      "Search fan-out consumer error",
    );
  });

  // -------------------------------------------------------------------------
  // ONDC Compliance Middleware
  // -------------------------------------------------------------------------
  // Rate limiting per subscriber (ONDC mandated)
  const rateLimiter = createRateLimiterMiddleware({
    redisClient: redis,
    maxRequests: parseInt(process.env["RATE_LIMIT_MAX"] ?? "200", 10),
    windowSeconds: parseInt(process.env["RATE_LIMIT_WINDOW"] ?? "60", 10),
  });

  // Duplicate message_id detection (ONDC spec: each message_id must be unique)
  const duplicateDetector = createDuplicateDetector({
    redisClient: redis,
    ttlSeconds: parseInt(process.env["DEDUP_TTL"] ?? "300", 10),
  });

  // Network policy enforcement (SLA headers)
  const networkPolicy = createNetworkPolicyMiddleware({
    redisClient: redis,
    enforceSla: true,
    enforceTags: false, // Gateway doesn't validate domain-specific tags
  });

  // Apply middleware globally
  fastify.addHook("preHandler", rateLimiter);
  fastify.addHook("preHandler", duplicateDetector);
  fastify.addHook("preHandler", networkPolicy);

  // -------------------------------------------------------------------------
  // Register routes
  // -------------------------------------------------------------------------
  registerSearchRoute(fastify, {
    registryClient,
    discoveryService,
    multicastService,
    db,
    gatewayPrivateKey: GATEWAY_PRIVATE_KEY,
    gatewaySubscriberId: GATEWAY_SUBSCRIBER_ID,
    gatewayKeyId: GATEWAY_KEY_ID,
  });

  registerOnSearchRoute(fastify, {
    registryClient,
    responseAggregator,
    db,
    gatewayPrivateKey: GATEWAY_PRIVATE_KEY,
    gatewaySubscriberId: GATEWAY_SUBSCRIBER_ID,
    gatewayKeyId: GATEWAY_KEY_ID,
  });

  registerHealthRoute(fastify, {
    rabbitConnection,
  });

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "Gateway server started");

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down gateway...");

    try {
      await fastify.close();
      logger.info("Fastify server closed");
    } catch (err) {
      logger.error({ err }, "Error closing Fastify");
    }

    try {
      await multicastService.close();
      logger.info("Multicast service closed");
    } catch (err) {
      logger.error({ err }, "Error closing multicast service");
    }

    try {
      await rabbitConnection.close();
      logger.info("RabbitMQ connection closed");
    } catch (err) {
      logger.error({ err }, "Error closing RabbitMQ connection");
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

    logger.info("Gateway shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Gateway failed to start");
  process.exit(1);
});
