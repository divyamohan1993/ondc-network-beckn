import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq, or, sql } from "drizzle-orm";
import {
  transactions,
  orders,
  auditLogs,
  erasureRequests,
  consentRecords,
  createLogger,
  anonymizePiiInBody,
  hashPiiValue,
} from "@ondc/shared";

const logger = createLogger("data-erasure");

/**
 * Body schema for POST /data-erasure/request.
 */
interface ErasureRequestBody {
  subscriber_id: string;
  data_principal_id: string;
  reason?: string;
}

/**
 * Body schema for consent endpoints.
 */
interface ConsentBody {
  data_principal_id: string;
  subscriber_id: string;
  purpose: string;
  consent_given: boolean;
  ip_address?: string;
  metadata?: Record<string, unknown>;
}

interface ConsentRevokeBody {
  data_principal_id: string;
  subscriber_id: string;
  purpose: string;
}

interface ConsentQuerystring {
  data_principal_id: string;
  subscriber_id?: string;
}

/**
 * DPDPA Right to Erasure and Consent Management endpoints.
 *
 * POST /data-erasure/request
 *   Accepts an erasure request, anonymizes PII across all tables,
 *   logs the action in audit_logs, and returns a confirmation.
 *
 * POST /consent/record
 *   Records a consent grant or denial.
 *
 * POST /consent/revoke
 *   Revokes a previously granted consent.
 *
 * GET /consent/status
 *   Returns all consent records for a data principal.
 */
export const dataErasureRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // -------------------------------------------------------------------
  // POST /data-erasure/request
  // -------------------------------------------------------------------
  fastify.post<{ Body: ErasureRequestBody }>(
    "/data-erasure/request",
    async (request, reply) => {
      const { subscriber_id, data_principal_id, reason } = request.body;

      if (!subscriber_id || !data_principal_id) {
        return reply.code(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "subscriber_id and data_principal_id are required.",
            details: [],
          },
        });
      }

      logger.info(
        { subscriber_id, data_principal_id },
        "Data erasure request received",
      );

      // Create erasure request record
      const [erasureRecord] = await fastify.db
        .insert(erasureRequests)
        .values({
          data_principal_id,
          subscriber_id,
          reason: reason ?? null,
          status: "PROCESSING",
        })
        .returning();

      const erasureId = erasureRecord!.id;
      let totalAnonymized = 0;

      try {
        // Hash the identifier for searching encrypted/plain bodies
        const principalHash = hashPiiValue(data_principal_id);

        // -----------------------------------------------------------------
        // 1. Anonymize transactions containing this data principal
        // -----------------------------------------------------------------
        // Search for PII in request_body and response_body JSONB columns.
        // We cast the body to text and search for the principal ID string.
        const matchingTransactions = await fastify.db
          .select({ id: transactions.id, request_body: transactions.request_body, response_body: transactions.response_body })
          .from(transactions)
          .where(
            or(
              sql`${transactions.request_body}::text ILIKE ${"%" + data_principal_id + "%"}`,
              sql`${transactions.response_body}::text ILIKE ${"%" + data_principal_id + "%"}`,
            ),
          );

        for (const txn of matchingTransactions) {
          const anonymizedReq = anonymizePiiInBody(txn.request_body);
          const anonymizedRes = anonymizePiiInBody(txn.response_body);

          await fastify.db
            .update(transactions)
            .set({
              request_body: anonymizedReq,
              response_body: anonymizedRes,
              updated_at: new Date(),
            })
            .where(eq(transactions.id, txn.id));

          totalAnonymized++;
        }

        // -----------------------------------------------------------------
        // 2. Anonymize orders containing this data principal
        // -----------------------------------------------------------------
        const matchingOrders = await fastify.db
          .select({
            id: orders.id,
            billing: orders.billing,
            fulfillments: orders.fulfillments,
          })
          .from(orders)
          .where(
            or(
              sql`${orders.billing}::text ILIKE ${"%" + data_principal_id + "%"}`,
              sql`${orders.fulfillments}::text ILIKE ${"%" + data_principal_id + "%"}`,
            ),
          );

        for (const order of matchingOrders) {
          const anonymizedBilling = anonymizePiiInBody(order.billing);
          const anonymizedFulfillments = anonymizePiiInBody(order.fulfillments);

          await fastify.db
            .update(orders)
            .set({
              billing: anonymizedBilling,
              fulfillments: anonymizedFulfillments,
              updated_at: new Date(),
            })
            .where(eq(orders.id, order.id));

          totalAnonymized++;
        }

        // -----------------------------------------------------------------
        // 3. Revoke all consents for this principal
        // -----------------------------------------------------------------
        await fastify.db
          .update(consentRecords)
          .set({ revoked_at: new Date() })
          .where(eq(consentRecords.data_principal_id, data_principal_id));

        // -----------------------------------------------------------------
        // 4. Mark erasure request as completed
        // -----------------------------------------------------------------
        await fastify.db
          .update(erasureRequests)
          .set({
            status: "COMPLETED",
            records_anonymized: totalAnonymized,
            completed_at: new Date(),
          })
          .where(eq(erasureRequests.id, erasureId));

        // -----------------------------------------------------------------
        // 5. Audit log
        // -----------------------------------------------------------------
        await fastify.db.insert(auditLogs).values({
          actor: subscriber_id,
          action: "DATA_ERASURE",
          resource_type: "data_principal",
          resource_id: principalHash,
          details: {
            erasure_id: erasureId,
            records_anonymized: totalAnonymized,
            reason: reason ?? null,
          },
          ip_address: request.ip,
        });

        logger.info(
          { erasureId, totalAnonymized, subscriber_id },
          "Data erasure completed",
        );

        return reply.code(200).send({
          erasure_id: erasureId,
          status: "COMPLETED",
          records_anonymized: totalAnonymized,
          message: "PII has been anonymized across all records.",
        });
      } catch (err) {
        logger.error({ err, erasureId }, "Data erasure failed");

        await fastify.db
          .update(erasureRequests)
          .set({ status: "FAILED", records_anonymized: totalAnonymized })
          .where(eq(erasureRequests.id, erasureId));

        return reply.code(500).send({
          error: {
            code: "ERASURE_FAILED",
            message: "Data erasure processing failed. Please retry.",
            details: [],
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------
  // POST /consent/record
  // -------------------------------------------------------------------
  fastify.post<{ Body: ConsentBody }>("/consent/record", async (request, reply) => {
    const {
      data_principal_id,
      subscriber_id,
      purpose,
      consent_given,
      ip_address,
      metadata,
    } = request.body;

    if (!data_principal_id || !subscriber_id || !purpose || consent_given === undefined) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message:
            "data_principal_id, subscriber_id, purpose, and consent_given are required.",
          details: [],
        },
      });
    }

    const [record] = await fastify.db
      .insert(consentRecords)
      .values({
        data_principal_id,
        subscriber_id,
        purpose,
        consent_given,
        ip_address: ip_address ?? request.ip,
        metadata: metadata ?? null,
      })
      .returning();

    await fastify.db.insert(auditLogs).values({
      actor: subscriber_id,
      action: consent_given ? "CONSENT_GRANTED" : "CONSENT_DENIED",
      resource_type: "consent",
      resource_id: record!.id,
      details: { data_principal_id: hashPiiValue(data_principal_id), purpose },
      ip_address: request.ip,
    });

    logger.info(
      { data_principal_id, subscriber_id, purpose, consent_given },
      "Consent recorded",
    );

    return reply.code(201).send({
      id: record!.id,
      status: consent_given ? "GRANTED" : "DENIED",
      timestamp: record!.consent_timestamp,
    });
  });

  // -------------------------------------------------------------------
  // POST /consent/revoke
  // -------------------------------------------------------------------
  fastify.post<{ Body: ConsentRevokeBody }>(
    "/consent/revoke",
    async (request, reply) => {
      const { data_principal_id, subscriber_id, purpose } = request.body;

      if (!data_principal_id || !subscriber_id || !purpose) {
        return reply.code(400).send({
          error: {
            code: "BAD_REQUEST",
            message:
              "data_principal_id, subscriber_id, and purpose are required.",
            details: [],
          },
        });
      }

      const result = await fastify.db
        .update(consentRecords)
        .set({ revoked_at: new Date() })
        .where(
          sql`${consentRecords.data_principal_id} = ${data_principal_id}
            AND ${consentRecords.subscriber_id} = ${subscriber_id}
            AND ${consentRecords.purpose} = ${purpose}
            AND ${consentRecords.revoked_at} IS NULL`,
        )
        .returning();

      if (result.length === 0) {
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "No active consent found matching the criteria.",
            details: [],
          },
        });
      }

      await fastify.db.insert(auditLogs).values({
        actor: subscriber_id,
        action: "CONSENT_REVOKED",
        resource_type: "consent",
        resource_id: result[0]!.id,
        details: { data_principal_id: hashPiiValue(data_principal_id), purpose },
        ip_address: request.ip,
      });

      logger.info(
        { data_principal_id, subscriber_id, purpose },
        "Consent revoked",
      );

      return reply.code(200).send({
        revoked_count: result.length,
        revoked_at: result[0]!.revoked_at,
      });
    },
  );

  // -------------------------------------------------------------------
  // GET /consent/status?data_principal_id=...&subscriber_id=...
  // -------------------------------------------------------------------
  fastify.get<{ Querystring: ConsentQuerystring }>(
    "/consent/status",
    async (request, reply) => {
      const { data_principal_id, subscriber_id } = request.query;

      if (!data_principal_id) {
        return reply.code(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "data_principal_id query parameter is required.",
            details: [],
          },
        });
      }

      const conditions = [
        eq(consentRecords.data_principal_id, data_principal_id),
      ];
      if (subscriber_id) {
        conditions.push(eq(consentRecords.subscriber_id, subscriber_id));
      }

      const records = await fastify.db
        .select()
        .from(consentRecords)
        .where(sql.join(conditions, sql` AND `));

      return reply.code(200).send({
        data_principal_id,
        consents: records.map((r) => ({
          id: r.id,
          subscriber_id: r.subscriber_id,
          purpose: r.purpose,
          consent_given: r.consent_given,
          granted_at: r.consent_timestamp,
          revoked_at: r.revoked_at,
          active: r.consent_given && !r.revoked_at,
        })),
      });
    },
  );
};
