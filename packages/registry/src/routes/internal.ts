import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { subscribers, transactions, auditLogs, type Database } from "@ondc/shared/db";
import {
  findAll,
  findById,
  updateStatus,
  deleteSubscriber,
  type SubscriberFilters,
} from "../services/subscriber.js";

const logger = createLogger("registry:internal");

const INTERNAL_API_KEY_HEADER = "x-internal-api-key";

// ---------------------------------------------------------------------------
// Internal auth guard
// ---------------------------------------------------------------------------

async function internalAuthGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers[INTERNAL_API_KEY_HEADER] as string | undefined;
  const expectedKey = process.env["INTERNAL_API_KEY"];

  // If no INTERNAL_API_KEY is configured, allow access (dev mode)
  if (expectedKey && apiKey !== expectedKey) {
    logger.warn({ ip: request.ip }, "Unauthorized internal API access attempt");
    reply.status(403).send({
      error: {
        type: "AUTH-ERROR",
        code: "FORBIDDEN",
        message: "Invalid or missing internal API key",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Internal admin API routes, protected by an internal API key header.
 * All routes are prefixed with /internal.
 */
export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;

  // Add auth guard to all routes in this plugin
  fastify.addHook("onRequest", internalAuthGuard);

  // =========================================================================
  // GET /internal/subscribers - List all with pagination and filters
  // =========================================================================
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      type?: string;
      domain?: string;
      status?: string;
      is_simulated?: string;
      search?: string;
    };
  }>("/internal/subscribers", async (request, reply) => {
    try {
      const query = request.query;

      const filters: SubscriberFilters = {};
      if (query.type) filters.type = query.type as SubscriberFilters["type"];
      if (query.domain) filters.domain = query.domain;
      if (query.status) filters.status = query.status as SubscriberFilters["status"];
      if (query.is_simulated !== undefined) {
        filters.is_simulated = query.is_simulated === "true";
      }
      if (query.search) filters.search = query.search;

      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 20;

      const result = await findAll(db, filters, { page, limit });

      return reply.status(200).send(result);
    } catch (err) {
      logger.error({ err }, "Error listing subscribers");
      return reply.status(500).send({
        error: { type: "INTERNAL-ERROR", code: "LIST_FAILED", message: "Failed to list subscribers" },
      });
    }
  });

  // =========================================================================
  // GET /internal/subscribers/:id - Get one subscriber with transaction count
  // =========================================================================
  fastify.get<{
    Params: { id: string };
  }>("/internal/subscribers/:id", async (request, reply) => {
    try {
      const { id } = request.params;

      const subscriber = await findById(db, id);
      if (!subscriber) {
        return reply.status(404).send({
          error: {
            type: "NOT-FOUND",
            code: "SUBSCRIBER_NOT_FOUND",
            message: `Subscriber with id ${id} not found`,
          },
        });
      }

      // Count transactions where this subscriber is the BAP or BPP
      const [bapCount, bppCount] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(eq(transactions.bap_id, subscriber.subscriber_id)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(eq(transactions.bpp_id, subscriber.subscriber_id)),
      ]);

      const transactionCount =
        (bapCount[0]?.count ?? 0) + (bppCount[0]?.count ?? 0);

      return reply.status(200).send({
        ...subscriber,
        transaction_count: transactionCount,
      });
    } catch (err) {
      logger.error({ err }, "Error fetching subscriber");
      return reply.status(500).send({
        error: { type: "INTERNAL-ERROR", code: "FETCH_FAILED", message: "Failed to fetch subscriber" },
      });
    }
  });

  // =========================================================================
  // PATCH /internal/subscribers/:id - Update subscriber status
  // =========================================================================
  fastify.patch<{
    Params: { id: string };
    Body: {
      action: "approve" | "suspend" | "revoke";
    };
  }>("/internal/subscribers/:id", async (request, reply) => {
    try {
      const { id } = request.params;
      const { action } = request.body;

      const statusMap: Record<string, "SUBSCRIBED" | "SUSPENDED" | "REVOKED"> = {
        approve: "SUBSCRIBED",
        suspend: "SUSPENDED",
        revoke: "REVOKED",
      };

      const newStatus = statusMap[action];
      if (!newStatus) {
        return reply.status(400).send({
          error: {
            type: "VALIDATION-ERROR",
            code: "INVALID_ACTION",
            message: `Invalid action: ${action}. Must be one of: approve, suspend, revoke`,
          },
        });
      }

      const existing = await findById(db, id);
      if (!existing) {
        return reply.status(404).send({
          error: {
            type: "NOT-FOUND",
            code: "SUBSCRIBER_NOT_FOUND",
            message: `Subscriber with id ${id} not found`,
          },
        });
      }

      const extra: { valid_from?: Date; valid_until?: Date } = {};
      if (action === "approve") {
        extra.valid_from = new Date();
        extra.valid_until = new Date();
        extra.valid_until.setFullYear(extra.valid_until.getFullYear() + 1);
      }

      const updated = await updateStatus(db, id, newStatus, extra);

      // Audit log
      await db.insert(auditLogs).values({
        actor: "admin",
        action: `SUBSCRIBER_${action.toUpperCase()}D`,
        resource_type: "subscriber",
        resource_id: id,
        details: {
          previous_status: existing.status,
          new_status: newStatus,
        },
        ip_address: request.ip,
      });

      logger.info(
        { id, action, newStatus },
        "Subscriber status updated via internal API",
      );

      return reply.status(200).send(updated);
    } catch (err) {
      logger.error({ err }, "Error updating subscriber status");
      return reply.status(500).send({
        error: { type: "INTERNAL-ERROR", code: "UPDATE_FAILED", message: "Failed to update subscriber" },
      });
    }
  });

  // =========================================================================
  // DELETE /internal/subscribers/:id - Delete subscriber
  // =========================================================================
  fastify.delete<{
    Params: { id: string };
  }>("/internal/subscribers/:id", async (request, reply) => {
    try {
      const { id } = request.params;

      const existing = await findById(db, id);
      if (!existing) {
        return reply.status(404).send({
          error: {
            type: "NOT-FOUND",
            code: "SUBSCRIBER_NOT_FOUND",
            message: `Subscriber with id ${id} not found`,
          },
        });
      }

      await deleteSubscriber(db, id);

      // Audit log
      await db.insert(auditLogs).values({
        actor: "admin",
        action: "SUBSCRIBER_DELETED",
        resource_type: "subscriber",
        resource_id: id,
        details: {
          subscriber_id: existing.subscriber_id,
          type: existing.type,
        },
        ip_address: request.ip,
      });

      logger.info({ id, subscriber_id: existing.subscriber_id }, "Subscriber deleted");

      return reply.status(200).send({ success: true, id });
    } catch (err) {
      logger.error({ err }, "Error deleting subscriber");
      return reply.status(500).send({
        error: { type: "INTERNAL-ERROR", code: "DELETE_FAILED", message: "Failed to delete subscriber" },
      });
    }
  });

  // =========================================================================
  // GET /internal/stats - Registry statistics
  // =========================================================================
  fastify.get("/internal/stats", async (_request, reply) => {
    try {
      const [
        totalResult,
        activeBapsResult,
        activeBppsResult,
        byDomainResult,
        byStatusResult,
      ] = await Promise.all([
        // Total subscribers
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(subscribers),

        // Active BAPs (SUBSCRIBED BAPs)
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(subscribers)
          .where(
            and(
              eq(subscribers.type, "BAP"),
              eq(subscribers.status, "SUBSCRIBED"),
            ),
          ),

        // Active BPPs (SUBSCRIBED BPPs)
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(subscribers)
          .where(
            and(
              eq(subscribers.type, "BPP"),
              eq(subscribers.status, "SUBSCRIBED"),
            ),
          ),

        // Count by domain
        db
          .select({
            domain: subscribers.domain,
            count: sql<number>`count(*)::int`,
          })
          .from(subscribers)
          .groupBy(subscribers.domain),

        // Count by status
        db
          .select({
            status: subscribers.status,
            count: sql<number>`count(*)::int`,
          })
          .from(subscribers)
          .groupBy(subscribers.status),
      ]);

      const byDomain: Record<string, number> = {};
      for (const row of byDomainResult) {
        byDomain[row.domain ?? "unknown"] = row.count;
      }

      const byStatus: Record<string, number> = {};
      for (const row of byStatusResult) {
        byStatus[row.status ?? "unknown"] = row.count;
      }

      return reply.status(200).send({
        total_subscribers: totalResult[0]?.count ?? 0,
        active_baps: activeBapsResult[0]?.count ?? 0,
        active_bpps: activeBppsResult[0]?.count ?? 0,
        by_domain: byDomain,
        by_status: byStatus,
      });
    } catch (err) {
      logger.error({ err }, "Error fetching stats");
      return reply.status(500).send({
        error: { type: "INTERNAL-ERROR", code: "STATS_FAILED", message: "Failed to fetch stats" },
      });
    }
  });
}
