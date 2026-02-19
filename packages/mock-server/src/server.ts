import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import Redis from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { createDb, type Database } from "@ondc/shared/db";
import { ack } from "@ondc/shared/protocol";

import { handleBapCallback, type BapMockConfig } from "./bap-mock.js";
import { handleBppAction, type BppMockConfig, type CatalogData } from "./bpp-mock.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Fastify type augmentation
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

const PORT = parseInt(process.env["MOCK_SERVER_PORT"] ?? "3010", 10);
const HOST = process.env["MOCK_SERVER_HOST"] ?? "0.0.0.0";
const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://ondc:ondc@localhost:5432/ondc_network";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const BAP_ADAPTER_URL = process.env["BAP_ADAPTER_URL"] ?? "http://localhost:3003";
const AUTO_CONTINUE = process.env["MOCK_AUTO_CONTINUE"] !== "false";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("mock-server");

// ---------------------------------------------------------------------------
// Load catalog data
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadCatalog(filename: string): CatalogData | null {
  try {
    const filePath = join(__dirname, "data", "catalogs", filename);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CatalogData;
  } catch (err) {
    logger.warn({ err, filename }, "Failed to load catalog file");
    return null;
  }
}

const catalogs: Record<string, CatalogData | null> = {
  "ONDC:NIC2004:49299": loadCatalog("water.json"),
  "ONDC:RET10": loadCatalog("food.json"),
  "ONDC:AGR10": loadCatalog("agriculture.json"),
  "ONDC:LOG10": loadCatalog("logistics.json"),
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

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
  // Register CORS
  // -------------------------------------------------------------------------
  await fastify.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // -------------------------------------------------------------------------
  // Connect to PostgreSQL via Drizzle
  // -------------------------------------------------------------------------
  logger.info("Connecting to PostgreSQL...");
  const { db, pool } = createDb(DATABASE_URL);
  fastify.decorate("db", db);

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
  // Mock configs
  // -------------------------------------------------------------------------

  const bapConfig: BapMockConfig = {
    bapAdapterUrl: BAP_ADAPTER_URL,
    autoContinue: AUTO_CONTINUE,
  };

  const bppConfig: BppMockConfig = {
    mockServerBaseUrl: `http://localhost:${PORT}`,
  };

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  // Health check
  fastify.get("/health", async (_request, _reply) => {
    return {
      status: "ok",
      service: "mock-server",
      timestamp: new Date().toISOString(),
      catalogs: Object.keys(catalogs).filter((k) => catalogs[k] !== null),
    };
  });

  // BAP callback routes: handles on_search, on_select, on_init, on_confirm, on_status, on_track
  fastify.post<{ Params: { action: string } }>(
    "/bap/callback/:action",
    async (request, reply) => {
      const { action } = request.params;
      const body = request.body as any;

      logger.info(
        {
          action,
          transactionId: body?.context?.transaction_id,
          domain: body?.context?.domain,
        },
        "BAP callback received",
      );

      try {
        const result = await handleBapCallback(action, body, bapConfig);

        // Log the transaction in the database
        try {
          const { transactions } = await import("@ondc/shared/db");
          await fastify.db.insert(transactions).values({
            transaction_id: body?.context?.transaction_id ?? "unknown",
            message_id: body?.context?.message_id ?? "unknown",
            action: action,
            bap_id: body?.context?.bap_id,
            bpp_id: body?.context?.bpp_id,
            domain: body?.context?.domain,
            city: body?.context?.city,
            request_body: body,
            status: "CALLBACK_RECEIVED",
            is_simulated: true,
          });
        } catch (dbErr) {
          logger.warn({ err: dbErr }, "Failed to log BAP callback transaction");
        }

        return reply.status(200).send(ack());
      } catch (err) {
        logger.error({ err, action }, "Error handling BAP callback");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  // BPP action routes: handles search, select, init, confirm, status, track
  fastify.post<{ Params: { action: string } }>(
    "/bpp/action/:action",
    async (request, reply) => {
      const { action } = request.params;
      const body = request.body as any;
      const domain = body?.context?.domain;

      logger.info(
        {
          action,
          transactionId: body?.context?.transaction_id,
          domain,
        },
        "BPP action received",
      );

      try {
        const catalogData = catalogs[domain] ?? null;
        const { callbackAction, response } = handleBppAction(
          action,
          body,
          catalogData,
          bppConfig,
        );

        // Log the transaction in the database
        try {
          const { transactions } = await import("@ondc/shared/db");
          await fastify.db.insert(transactions).values({
            transaction_id: body?.context?.transaction_id ?? "unknown",
            message_id: body?.context?.message_id ?? "unknown",
            action: action,
            bap_id: body?.context?.bap_id,
            bpp_id: body?.context?.bpp_id,
            domain: body?.context?.domain,
            city: body?.context?.city,
            request_body: body,
            response_body: response,
            status: "ACK",
            is_simulated: true,
          });
        } catch (dbErr) {
          logger.warn({ err: dbErr }, "Failed to log BPP action transaction");
        }

        // Send the callback response to the BAP's callback URL
        const bapUri = body?.context?.bap_uri;
        if (bapUri) {
          const callbackUrl = `${bapUri}/${callbackAction}`;
          logger.info({ callbackUrl, callbackAction }, "Sending callback to BAP");

          // Fire and forget the callback
          import("undici").then(({ request: httpReq }) => {
            httpReq(callbackUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            }).catch((err) => {
              logger.warn({ err, callbackUrl }, "Failed to send callback to BAP");
            });
          });
        }

        // Return ACK immediately
        return reply.status(200).send(ack());
      } catch (err) {
        logger.error({ err, action }, "Error handling BPP action");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

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
    logger.info(
      { port: PORT, host: HOST, autoContinue: AUTO_CONTINUE },
      "ONDC Mock Server started",
    );
  } catch (err) {
    logger.error({ err }, "Failed to start mock server");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error during startup");
  process.exit(1);
});
