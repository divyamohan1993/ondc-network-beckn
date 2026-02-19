import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import Redis from "ioredis";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { createLogger } from "@ondc/shared/utils";

import * as vaultSchema from "./db/schema.js";
import { EncryptionService } from "./services/encryption.js";
import { TokenManager } from "./services/token-manager.js";
import { RotationScheduler } from "./services/rotation-scheduler.js";

import { healthRoutes } from "./routes/health.js";
import { secretsRoutes } from "./routes/secrets.js";
import { tokensRoutes } from "./routes/tokens.js";
import { rotationRoutes } from "./routes/rotation.js";

import type { Database } from "./types.js";

// ---------------------------------------------------------------------------
// SQL table definitions (for reference - add to db/init.sql separately)
// ---------------------------------------------------------------------------
/*
CREATE TABLE IF NOT EXISTS vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  encrypted_value TEXT NOT NULL,
  previous_encrypted_value TEXT,
  service TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  rotation_interval_seconds INTEGER,
  last_rotated_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_secrets_name ON vault_secrets(name);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_service ON vault_secrets(service);

CREATE TABLE IF NOT EXISTS vault_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scope JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_tokens_service_id ON vault_tokens(service_id);
CREATE INDEX IF NOT EXISTS idx_vault_tokens_token_hash ON vault_tokens(token_hash);

CREATE TABLE IF NOT EXISTS rotation_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  headers JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotation_hooks_secret_name ON rotation_hooks(secret_name);
*/

// ---------------------------------------------------------------------------
// Fastify type augmentation for decorated properties
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    redis: Redis;
    encryption: EncryptionService;
    tokenManager: TokenManager;
    rotationScheduler: RotationScheduler;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["VAULT_PORT"] ?? "3006", 10);
const HOST = process.env["VAULT_HOST"] ?? "0.0.0.0";
const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://ondc:ondc@localhost:5432/ondc";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const VAULT_MASTER_KEY = process.env["VAULT_MASTER_KEY"];
const VAULT_TOKEN_SECRET = process.env["VAULT_TOKEN_SECRET"];
const ROTATION_CHECK_INTERVAL_MS = parseInt(
  process.env["ROTATION_CHECK_INTERVAL_MS"] ?? "60000",
  10,
);

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("vault");

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Validate required environment variables
  // -------------------------------------------------------------------------
  if (!VAULT_MASTER_KEY) {
    logger.error("VAULT_MASTER_KEY environment variable is required");
    process.exit(1);
  }

  if (!VAULT_TOKEN_SECRET) {
    logger.error("VAULT_TOKEN_SECRET environment variable is required");
    process.exit(1);
  }

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
  // Register CORS
  // -------------------------------------------------------------------------
  await fastify.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-vault-token"],
  });

  // -------------------------------------------------------------------------
  // Connect to PostgreSQL via Drizzle (with vault schema)
  // -------------------------------------------------------------------------
  logger.info("Connecting to PostgreSQL...");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema: vaultSchema });

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
  fastify.decorate("redis", redis);

  // -------------------------------------------------------------------------
  // Initialize encryption service
  // -------------------------------------------------------------------------
  logger.info("Initializing encryption service...");
  const encryption = new EncryptionService(VAULT_MASTER_KEY);
  fastify.decorate("encryption", encryption);
  logger.info("Encryption service initialized");

  // -------------------------------------------------------------------------
  // Initialize token manager
  // -------------------------------------------------------------------------
  logger.info("Initializing token manager...");
  const tokenManager = new TokenManager(VAULT_TOKEN_SECRET, redis, db);
  fastify.decorate("tokenManager", tokenManager);
  logger.info("Token manager initialized");

  // -------------------------------------------------------------------------
  // Initialize rotation scheduler
  // -------------------------------------------------------------------------
  logger.info("Initializing rotation scheduler...");
  const rotationScheduler = new RotationScheduler(
    db,
    encryption,
    ROTATION_CHECK_INTERVAL_MS,
  );
  fastify.decorate("rotationScheduler", rotationScheduler);
  logger.info("Rotation scheduler initialized");

  // -------------------------------------------------------------------------
  // Register route plugins
  // -------------------------------------------------------------------------
  await fastify.register(healthRoutes);
  await fastify.register(secretsRoutes);
  await fastify.register(tokensRoutes);
  await fastify.register(rotationRoutes);

  // -------------------------------------------------------------------------
  // Start the rotation scheduler
  // -------------------------------------------------------------------------
  rotationScheduler.start();

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Received shutdown signal, closing gracefully...");

    // Stop the rotation scheduler first
    try {
      rotationScheduler.stop();
      logger.info("Rotation scheduler stopped");
    } catch (err) {
      logger.error({ err }, "Error stopping rotation scheduler");
    }

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
    logger.info({ port: PORT, host: HOST }, "ONDC Vault service started");
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error during startup");
  process.exit(1);
});
