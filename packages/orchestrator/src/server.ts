import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createLogger } from "@ondc/shared";

import { AgentRegistry } from "./services/agent-registry.js";
import { WsHub } from "./services/ws-hub.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerServiceRoutes } from "./routes/services.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerTeardownRoutes } from "./routes/teardown.js";
import { registerModeRoutes } from "./routes/mode.js";

const logger = createLogger("orchestrator");

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["ORCHESTRATOR_PORT"] ?? "3007", 10);
const HOST = process.env["ORCHESTRATOR_HOST"] ?? "0.0.0.0";
const HEALTH_CHECK_INTERVAL_MS = parseInt(
  process.env["HEALTH_CHECK_INTERVAL_MS"] ?? "30000",
  10,
);
const STATS_COLLECTION_INTERVAL_MS = parseInt(
  process.env["STATS_COLLECTION_INTERVAL_MS"] ?? "10000",
  10,
);

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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Register WebSocket support
  await fastify.register(websocket);

  // -------------------------------------------------------------------------
  // Initialize services
  // -------------------------------------------------------------------------

  // Agent Registry
  logger.info("Initializing agent registry...");
  const agentRegistry = new AgentRegistry(PORT);
  await agentRegistry.init();
  logger.info("Agent registry initialized");

  // WebSocket Hub
  const wsHub = new WsHub();
  wsHub.register(fastify);
  logger.info("WebSocket hub initialized");

  // -------------------------------------------------------------------------
  // Register routes
  // -------------------------------------------------------------------------

  const routeConfig = {
    registry: agentRegistry,
    wsHub,
  };

  registerHealthRoute(fastify, routeConfig);
  registerServiceRoutes(fastify, routeConfig);
  registerAgentRoutes(fastify, routeConfig);
  registerTeardownRoutes(fastify, routeConfig);
  registerModeRoutes(fastify, routeConfig);

  logger.info("All routes registered");

  // -------------------------------------------------------------------------
  // Start periodic health checks (every 30s)
  // -------------------------------------------------------------------------
  const healthCheckTimer = setInterval(async () => {
    try {
      // Refresh container discovery
      await agentRegistry.discoverContainers();

      // Run health checks
      const results = await agentRegistry.runHealthChecks();

      // Broadcast results
      for (const result of results) {
        wsHub.broadcast("agent:health", result);
      }

      // Broadcast agent statuses
      for (const agent of agentRegistry.getAllAgents()) {
        wsHub.broadcast("agent:status", {
          name: agent.name,
          status: agent.status,
          type: agent.type,
        });
      }
    } catch (err) {
      logger.error({ err }, "Periodic health check failed");
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // -------------------------------------------------------------------------
  // Start periodic stats collection (every 10s)
  // -------------------------------------------------------------------------
  const statsTimer = setInterval(async () => {
    try {
      await agentRegistry.collectStats();
      await agentRegistry.refreshUptimeInfo();

      // Broadcast stats for running agents
      for (const agent of agentRegistry.getAllAgents()) {
        if (agent.status === "running" && agent.cpu !== null) {
          wsHub.broadcast("agent:stats", {
            name: agent.name,
            cpu: agent.cpu,
            memory: agent.memory,
            memoryLimit: agent.memoryLimit,
            networkRx: agent.networkRx,
            networkTx: agent.networkTx,
            uptime: agent.uptime,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Periodic stats collection failed");
    }
  }, STATS_COLLECTION_INTERVAL_MS);

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "Orchestrator server started");

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down orchestrator...");

    // Stop periodic timers
    clearInterval(healthCheckTimer);
    clearInterval(statsTimer);
    logger.info("Periodic timers stopped");

    // Close WebSocket hub
    try {
      await wsHub.close();
      logger.info("WebSocket hub closed");
    } catch (err) {
      logger.error({ err }, "Error closing WebSocket hub");
    }

    // Close Fastify server
    try {
      await fastify.close();
      logger.info("Fastify server closed");
    } catch (err) {
      logger.error({ err }, "Error closing Fastify");
    }

    logger.info("Orchestrator shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Orchestrator failed to start");
  process.exit(1);
});
