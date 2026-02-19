import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { WsHub } from "../services/ws-hub.js";
import { restartContainer, startContainer, stopContainer } from "../services/docker-client.js";
import { verifyAuth } from "../middleware/auth.js";

const logger = createLogger("mode-routes");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppMode = "production" | "development";

export interface ModeRoutesConfig {
  registry: AgentRegistry;
  wsHub: WsHub;
}

// ---------------------------------------------------------------------------
// In-memory mode tracking
// ---------------------------------------------------------------------------

let currentMode: AppMode = (process.env["APP_MODE"] as AppMode) ?? "development";

// Services that are only active in development mode
const DEV_ONLY_SERVICES = ["mock-server", "simulation-engine"];

// Services that should be restarted when mode changes
const MODE_AFFECTED_SERVICES = ["bap", "bpp", "gateway", "registry"];

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerModeRoutes(
  fastify: FastifyInstance,
  config: ModeRoutesConfig,
): void {
  const { registry, wsHub } = config;

  // -------------------------------------------------------------------------
  // GET /mode - Get current mode
  // -------------------------------------------------------------------------
  fastify.get(
    "/mode",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        mode: currentMode,
        devServicesEnabled: currentMode === "development",
        devServices: DEV_ONLY_SERVICES,
        timestamp: new Date().toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /mode/production - Switch to production mode
  // -------------------------------------------------------------------------
  fastify.post(
    "/mode/production",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (currentMode === "production") {
        return reply.code(200).send({
          mode: "production",
          message: "Already in production mode",
          changed: false,
        });
      }

      logger.info("Switching to production mode");

      try {
        // Update env file
        await updateEnvFile("APP_MODE", "production");
        await updateEnvFile("NODE_ENV", "production");

        currentMode = "production";
        process.env["APP_MODE"] = "production";
        process.env["NODE_ENV"] = "production";

        // Stop development-only services
        for (const name of DEV_ONLY_SERVICES) {
          const agent = registry.getAgent(name);
          if (agent?.containerId && agent.status === "running") {
            try {
              await stopContainer(agent.containerId);
              registry.updateAgentStatus(name, "stopped");
              wsHub.broadcast("service:stopped", { name, reason: "mode-switch" });
              logger.info({ name }, "Stopped dev-only service");
            } catch (err) {
              logger.error({ err, name }, "Failed to stop dev-only service");
            }
          }
        }

        // Restart affected services to pick up new env
        for (const name of MODE_AFFECTED_SERVICES) {
          const agent = registry.getAgent(name);
          if (agent?.containerId && agent.status === "running") {
            try {
              await restartContainer(agent.containerId);
              wsHub.broadcast("service:restarted", { name, reason: "mode-switch" });
              logger.info({ name }, "Restarted service for mode switch");
            } catch (err) {
              logger.error({ err, name }, "Failed to restart service for mode switch");
            }
          }
        }

        return reply.code(200).send({
          mode: "production",
          message: "Switched to production mode. Dev services stopped, affected services restarted.",
          changed: true,
          stoppedServices: DEV_ONLY_SERVICES,
          restartedServices: MODE_AFFECTED_SERVICES,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err }, "Failed to switch to production mode");
        return reply.code(500).send({
          error: "Mode switch failed",
          message,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /mode/development - Switch to development mode
  // -------------------------------------------------------------------------
  fastify.post(
    "/mode/development",
    { preHandler: verifyAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (currentMode === "development") {
        return reply.code(200).send({
          mode: "development",
          message: "Already in development mode",
          changed: false,
        });
      }

      logger.info("Switching to development mode");

      try {
        // Update env file
        await updateEnvFile("APP_MODE", "development");
        await updateEnvFile("NODE_ENV", "development");

        currentMode = "development";
        process.env["APP_MODE"] = "development";
        process.env["NODE_ENV"] = "development";

        // Start development-only services
        for (const name of DEV_ONLY_SERVICES) {
          const agent = registry.getAgent(name);
          if (agent?.containerId && agent.status !== "running") {
            try {
              await startContainer(agent.containerId);
              registry.updateAgentStatus(name, "running");
              wsHub.broadcast("service:started", { name, reason: "mode-switch" });
              logger.info({ name }, "Started dev-only service");
            } catch (err) {
              logger.error({ err, name }, "Failed to start dev-only service");
            }
          }
        }

        // Restart affected services to pick up new env
        for (const name of MODE_AFFECTED_SERVICES) {
          const agent = registry.getAgent(name);
          if (agent?.containerId && agent.status === "running") {
            try {
              await restartContainer(agent.containerId);
              wsHub.broadcast("service:restarted", { name, reason: "mode-switch" });
              logger.info({ name }, "Restarted service for mode switch");
            } catch (err) {
              logger.error({ err, name }, "Failed to restart service for mode switch");
            }
          }
        }

        return reply.code(200).send({
          mode: "development",
          message: "Switched to development mode. Dev services started, affected services restarted.",
          changed: true,
          startedServices: DEV_ONLY_SERVICES,
          restartedServices: MODE_AFFECTED_SERVICES,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err }, "Failed to switch to development mode");
        return reply.code(500).send({
          error: "Mode switch failed",
          message,
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Update or add a key=value pair in the project .env file.
 * The .env file is expected to be at the project root (two directories above packages/orchestrator).
 */
async function updateEnvFile(key: string, value: string): Promise<void> {
  // Resolve the .env path relative to the project root
  const envPath =
    process.env["ENV_FILE_PATH"] ??
    path.resolve(process.cwd(), ".env");

  try {
    let content = "";
    try {
      content = fs.readFileSync(envPath, "utf-8");
    } catch {
      // File doesn't exist yet; we'll create it
    }

    const lines = content.split("\n");
    let found = false;

    const updated = lines.map((line) => {
      // Match KEY=value or KEY="value" patterns, ignoring comments
      if (line.startsWith(`${key}=`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!found) {
      updated.push(`${key}=${value}`);
    }

    fs.writeFileSync(envPath, updated.join("\n"), "utf-8");
    logger.info({ key, value, envPath }, "Updated .env file");
  } catch (err) {
    logger.error({ err, key, envPath }, "Failed to update .env file");
    // Don't throw -- the env var is already set in process.env
  }
}
