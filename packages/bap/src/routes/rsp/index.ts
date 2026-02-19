import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  RspAction,
  RspCallbackAction,
  validateBecknRequest,
  buildAuthHeader,
  buildContext,
  ack,
  nack,
  transactions,
  settlements,
  createVerifyAuthMiddleware,
  createLogger,
} from "@ondc/shared";
import type {
  CollectorReconRequest,
  OnCollectorReconRequest,
  ReceiverReconRequest,
  OnReceiverReconRequest,
  OrderReconEntry,
} from "@ondc/shared";
import { request as httpRequest } from "undici";
import { notifyWebhook } from "../../services/webhook.js";

const logger = createLogger("bap-rsp");

// ---------------------------------------------------------------------------
// BAP RSP (Reconciliation & Settlement Protocol) Routes
// ---------------------------------------------------------------------------
// The BAP is typically the collector-side (buyer NP). It:
//   - Sends collector_recon to BPP (POST /collector_recon)
//   - Receives on_collector_recon from BPP (POST /on_collector_recon)
//   - Receives receiver_recon from BPP (POST /receiver_recon)
//   - Sends on_receiver_recon to BPP (POST /on_receiver_recon)
// ---------------------------------------------------------------------------

/**
 * Extract settlement records from an orderbook for database persistence.
 */
function extractSettlements(
  orders: OrderReconEntry[],
  collectorAppId: string,
  receiverAppId: string,
): Array<{
  transaction_id: string;
  order_id: string;
  collector_app_id: string;
  receiver_app_id: string;
  settlement_type: string;
  settlement_amount: string;
  settlement_currency: string;
  settlement_reference: string | null;
  settlement_counterparty: string | null;
  settlement_phase: string | null;
}> {
  return orders.map((order) => {
    const settlementDetails = order.payment?.["@ondc/org/settlement_details"]?.[0];
    return {
      transaction_id: order.payment?.params?.transaction_id ?? order.id,
      order_id: order.id,
      collector_app_id: order.collector_app_id ?? collectorAppId,
      receiver_app_id: order.receiver_app_id ?? receiverAppId,
      settlement_type: settlementDetails?.settlement_type ?? "neft",
      settlement_amount: settlementDetails?.settlement_amount ?? order.payment?.params?.amount ?? "0.00",
      settlement_currency: order.payment?.params?.currency ?? "INR",
      settlement_reference: settlementDetails?.settlement_reference ?? null,
      settlement_counterparty: settlementDetails?.settlement_counterparty ?? null,
      settlement_phase: settlementDetails?.settlement_phase ?? null,
    };
  });
}

export const registerRspRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Auth verification for incoming requests from BPP
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // -------------------------------------------------------------------------
  // POST /collector_recon  -  BAP sends reconciliation data to BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: CollectorReconRequest }>(
    `/${RspAction.collector_recon}`,
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: RspAction.collector_recon, errors: validation.errors },
          "Invalid collector_recon request",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const orders = message.orderbook?.orders ?? [];

      if (!context.bpp_uri) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "context.bpp_uri is required for collector_recon.",
          ),
        );
      }

      try {
        // Persist settlement records
        const settlementRecords = extractSettlements(
          orders,
          context.bap_id,
          context.bpp_id ?? "",
        );

        for (const record of settlementRecords) {
          await fastify.db.insert(settlements).values(record).catch((err) => {
            logger.warn(
              { err, orderId: record.order_id },
              "Settlement record insert failed (may already exist)",
            );
          });
        }

        // Log the transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: RspAction.collector_recon,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "SENT",
        });

        // Sign and forward to BPP (fire-and-forget)
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bapId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body,
        });

        const bppUrl = `${context.bpp_uri.replace(/\/+$/, "")}/${RspAction.collector_recon}`;

        httpRequest(bppUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
        }).catch((err) => {
          logger.error(
            { err, url: bppUrl, transactionId: context.transaction_id },
            "Failed to send collector_recon to BPP",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "collector_recon dispatched to BPP",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing collector_recon");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing collector_recon."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /on_collector_recon  -  BAP receives on_collector_recon from BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OnCollectorReconRequest }>(
    `/${RspCallbackAction.on_collector_recon}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: RspCallbackAction.on_collector_recon, errors: validation.errors },
          "Invalid on_collector_recon callback",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const orders = message.orderbook?.orders ?? [];

      try {
        // Log the callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: RspCallbackAction.on_collector_recon,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify buyer app webhook (fire-and-forget)
        notifyWebhook(
          context.bap_id,
          RspCallbackAction.on_collector_recon,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Webhook notification failed for on_collector_recon",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "on_collector_recon callback received and processed",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing on_collector_recon callback");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing on_collector_recon."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /receiver_recon  -  BAP receives receiver_recon from BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: ReceiverReconRequest }>(
    `/${RspAction.receiver_recon}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: RspAction.receiver_recon, errors: validation.errors },
          "Invalid receiver_recon request",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const orders = message.orderbook?.orders ?? [];

      try {
        // Persist settlement records from receiver
        const settlementRecords = extractSettlements(
          orders,
          context.bap_id,
          context.bpp_id ?? "",
        );

        for (const record of settlementRecords) {
          await fastify.db.insert(settlements).values(record).catch((err) => {
            logger.warn(
              { err, orderId: record.order_id },
              "Settlement record insert failed (may already exist)",
            );
          });
        }

        // Log the transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: RspAction.receiver_recon,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify buyer app webhook (fire-and-forget)
        notifyWebhook(
          context.bap_id,
          RspAction.receiver_recon,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Webhook notification failed for receiver_recon",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "receiver_recon received and processed",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing receiver_recon");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing receiver_recon."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /on_receiver_recon  -  BAP sends on_receiver_recon to BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OnReceiverReconRequest }>(
    `/${RspCallbackAction.on_receiver_recon}`,
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: RspCallbackAction.on_receiver_recon, errors: validation.errors },
          "Invalid on_receiver_recon request",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context } = body;

      if (!context.bpp_uri) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "context.bpp_uri is required for on_receiver_recon.",
          ),
        );
      }

      try {
        // Log the transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: RspCallbackAction.on_receiver_recon,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "SENT",
        });

        // Sign and forward to BPP (fire-and-forget)
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bapId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body,
        });

        const bppUrl = `${context.bpp_uri.replace(/\/+$/, "")}/${RspCallbackAction.on_receiver_recon}`;

        httpRequest(bppUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
        }).catch((err) => {
          logger.error(
            { err, url: bppUrl, transactionId: context.transaction_id },
            "Failed to send on_receiver_recon to BPP",
          );
        });

        logger.info(
          { transactionId: context.transaction_id },
          "on_receiver_recon dispatched to BPP",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing on_receiver_recon");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing on_receiver_recon."),
        );
      }
    },
  );
};
