import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { HealthMonitor } from "../services/monitor.js";
import type { MonitorConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Route parameter / query types
// ---------------------------------------------------------------------------

interface ServiceParams {
  service: string;
}

interface ConfigBody {
  checkIntervalMs?: number;
  responseTimeThresholdMs?: number;
  historySize?: number;
  prolongedDowntimeMinutes?: number;
}

interface AcknowledgeParams {
  id: string;
}

interface AcknowledgeBody {
  acknowledgedBy?: string;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all monitoring status routes on the Fastify instance.
 */
export function registerStatusRoutes(
  fastify: FastifyInstance,
  monitor: HealthMonitor,
): void {
  // -------------------------------------------------------------------------
  // GET /status - Current status of all services
  // -------------------------------------------------------------------------
  fastify.get("/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    const statuses = monitor.getAllStatus();
    return reply.code(200).send({
      timestamp: new Date().toISOString(),
      services: statuses,
    });
  });

  // -------------------------------------------------------------------------
  // GET /status/summary - Summary counts (up, down, degraded)
  // -------------------------------------------------------------------------
  fastify.get("/status/summary", async (_request: FastifyRequest, reply: FastifyReply) => {
    const summary = monitor.getSummary();
    return reply.code(200).send({
      timestamp: new Date().toISOString(),
      summary,
    });
  });

  // -------------------------------------------------------------------------
  // GET /status/:service - Detailed status and history for one service
  // -------------------------------------------------------------------------
  fastify.get<{ Params: ServiceParams }>(
    "/status/:service",
    async (request: FastifyRequest<{ Params: ServiceParams }>, reply: FastifyReply) => {
      const { service } = request.params;
      const status = monitor.getServiceStatus(service);

      if (!status) {
        return reply.code(404).send({
          error: "Service not found",
          message: `No service registered with name: ${service}`,
        });
      }

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        service: status,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /metrics - SLA metrics for all services
  // -------------------------------------------------------------------------
  fastify.get("/metrics", async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = monitor.getSLAMetrics();
    return reply.code(200).send({
      timestamp: new Date().toISOString(),
      metrics,
    });
  });

  // -------------------------------------------------------------------------
  // GET /alerts - Recent alerts (last 100)
  // -------------------------------------------------------------------------
  fastify.get("/alerts", async (_request: FastifyRequest, reply: FastifyReply) => {
    const alerts = monitor.getRecentAlerts();
    return reply.code(200).send({
      timestamp: new Date().toISOString(),
      count: alerts.length,
      alerts,
    });
  });

  // -------------------------------------------------------------------------
  // POST /alerts/acknowledge/:id - Acknowledge an alert
  // -------------------------------------------------------------------------
  fastify.post<{ Params: AcknowledgeParams; Body: AcknowledgeBody }>(
    "/alerts/acknowledge/:id",
    async (
      request: FastifyRequest<{ Params: AcknowledgeParams; Body: AcknowledgeBody }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { acknowledgedBy } = request.body ?? {};

      const alert = await monitor.acknowledgeAlert(id, acknowledgedBy);
      if (!alert) {
        return reply.code(404).send({
          error: "Alert not found",
          message: `No alert found with ID: ${id}`,
        });
      }

      return reply.code(200).send({
        message: "Alert acknowledged",
        alert,
      });
    },
  );

  // -------------------------------------------------------------------------
  // PUT /config - Update monitor configuration
  // -------------------------------------------------------------------------
  fastify.put<{ Body: ConfigBody }>(
    "/config",
    async (request: FastifyRequest<{ Body: ConfigBody }>, reply: FastifyReply) => {
      const updates = request.body;

      if (!updates || Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: "Bad request",
          message: "No configuration updates provided",
        });
      }

      // Validate values
      if (updates.checkIntervalMs !== undefined && updates.checkIntervalMs < 1000) {
        return reply.code(400).send({
          error: "Bad request",
          message: "checkIntervalMs must be at least 1000ms",
        });
      }
      if (updates.responseTimeThresholdMs !== undefined && updates.responseTimeThresholdMs < 100) {
        return reply.code(400).send({
          error: "Bad request",
          message: "responseTimeThresholdMs must be at least 100ms",
        });
      }

      const config = monitor.updateConfig(updates);
      return reply.code(200).send({
        message: "Configuration updated",
        config,
      });
    },
  );
}
