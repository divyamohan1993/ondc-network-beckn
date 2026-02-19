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

const logger = createLogger("bpp-rsp");

// ---------------------------------------------------------------------------
// BPP RSP (Reconciliation & Settlement Protocol) Routes
// ---------------------------------------------------------------------------
// The BPP is typically the receiver-side (seller NP). It:
//   - Receives collector_recon from BAP (POST /collector_recon)
//   - Sends on_collector_recon callback to BAP (async)
//   - Sends receiver_recon to BAP (POST /receiver_recon)
//   - Receives on_receiver_recon from BAP (POST /on_receiver_recon)
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

/**
 * Send a signed RSP callback to the BAP.
 */
async function sendRspCallback(
  bapUri: string,
  callbackAction: string,
  body: object,
  privateKey: string,
  subscriberId: string,
  keyId: string,
): Promise<void> {
  const authHeader = buildAuthHeader({
    subscriberId,
    uniqueKeyId: keyId,
    privateKey,
    body,
  });

  const url = `${bapUri.replace(/\/+$/, "")}/${callbackAction}`;

  logger.info({ url, callbackAction }, "Sending RSP callback to BAP");

  try {
    const { statusCode, body: responseBody } = await httpRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    const responseText = await responseBody.text();

    if (statusCode !== 200) {
      logger.warn(
        { url, statusCode, response: responseText },
        "BAP RSP callback returned non-200 status",
      );
    } else {
      logger.info({ url, callbackAction, statusCode }, "RSP callback sent to BAP");
    }
  } catch (err) {
    logger.error({ err, url, callbackAction }, "Failed to send RSP callback to BAP");
  }
}

export const registerRspRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Auth verification for incoming requests from BAP
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // -------------------------------------------------------------------------
  // POST /collector_recon  -  BPP receives collector_recon from BAP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: CollectorReconRequest }>(
    `/${RspAction.collector_recon}`,
    { preHandler: verifyAuth },
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

      try {
        // Persist settlement records
        const settlementRecords = extractSettlements(
          orders,
          context.bap_id,
          fastify.config.bppId,
        );

        for (const record of settlementRecords) {
          await fastify.db.insert(settlements).values(record).catch((err) => {
            logger.warn(
              { err, orderId: record.order_id },
              "Settlement record insert failed (may already exist)",
            );
          });
        }

        // Log incoming transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: RspAction.collector_recon,
          bap_id: context.bap_id,
          bpp_id: fastify.config.bppId,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify seller webhook (fire-and-forget)
        notifyWebhook(
          fastify.config.bppId,
          RspAction.collector_recon,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Seller webhook notification failed for collector_recon",
          );
        });

        // Asynchronously send on_collector_recon callback to BAP
        const callbackContext = buildContext({
          domain: context.domain,
          city: context.city,
          action: RspCallbackAction.on_collector_recon,
          bap_id: context.bap_id,
          bap_uri: context.bap_uri,
          bpp_id: fastify.config.bppId,
          bpp_uri: fastify.config.bppUri,
          transaction_id: context.transaction_id,
        });

        // Build callback body echoing back the orders with recon status
        const callbackBody: OnCollectorReconRequest = {
          context: callbackContext,
          message: {
            orderbook: {
              orders: orders.map((order) => ({
                ...order,
                recon_status: order.recon_status ?? "01",
                updated_at: new Date().toISOString(),
              })),
            },
          },
        };

        // Log callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: callbackContext.transaction_id,
          message_id: callbackContext.message_id,
          action: RspCallbackAction.on_collector_recon,
          bap_id: callbackContext.bap_id,
          bpp_id: callbackContext.bpp_id,
          domain: callbackContext.domain,
          city: callbackContext.city,
          request_body: callbackBody,
          status: "SENT",
        });

        // Send on_collector_recon callback to BAP (fire-and-forget)
        sendRspCallback(
          context.bap_uri,
          RspCallbackAction.on_collector_recon,
          callbackBody,
          fastify.config.privateKey,
          fastify.config.bppId,
          fastify.config.uniqueKeyId,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Async on_collector_recon callback failed",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "collector_recon received and on_collector_recon dispatched",
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
  // POST /on_collector_recon  -  BPP internal endpoint to send on_collector_recon
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: {
      bap_uri: string;
      bap_id: string;
      transaction_id: string;
      domain?: string;
      city?: string;
      message: Record<string, unknown>;
    };
  }>(`/internal/${RspCallbackAction.on_collector_recon}`, async (request, reply) => {
    const { bap_uri, bap_id, transaction_id, domain, city, message } =
      request.body;

    if (!bap_uri || !bap_id || !transaction_id) {
      return reply.code(400).send(
        nack(
          "CONTEXT-ERROR",
          "10000",
          "bap_uri, bap_id, and transaction_id are required.",
        ),
      );
    }

    try {
      const callbackContext = buildContext({
        domain: domain ?? "nic2004:52110",
        city: city ?? "std:080",
        action: RspCallbackAction.on_collector_recon,
        bap_id,
        bap_uri,
        bpp_id: fastify.config.bppId,
        bpp_uri: fastify.config.bppUri,
        transaction_id,
      });

      const callbackBody = {
        context: callbackContext,
        message: message ?? {},
      };

      // Log the callback transaction
      await fastify.db.insert(transactions).values({
        transaction_id: callbackContext.transaction_id,
        message_id: callbackContext.message_id,
        action: RspCallbackAction.on_collector_recon,
        bap_id: callbackContext.bap_id,
        bpp_id: callbackContext.bpp_id,
        domain: callbackContext.domain,
        city: callbackContext.city,
        request_body: callbackBody,
        status: "SENT",
      });

      // Send callback to BAP (fire-and-forget)
      sendRspCallback(
        bap_uri,
        RspCallbackAction.on_collector_recon,
        callbackBody,
        fastify.config.privateKey,
        fastify.config.bppId,
        fastify.config.uniqueKeyId,
      ).catch((err) => {
        logger.error(
          { err, transactionId: transaction_id },
          "Failed to send on_collector_recon callback",
        );
      });

      return reply.code(200).send(ack());
    } catch (err) {
      logger.error({ err }, "Error sending on_collector_recon callback");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error sending on_collector_recon."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /receiver_recon  -  BPP sends receiver_recon to BAP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: ReceiverReconRequest }>(
    `/${RspAction.receiver_recon}`,
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

      if (!context.bap_uri) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "context.bap_uri is required for receiver_recon.",
          ),
        );
      }

      try {
        // Persist settlement records
        const settlementRecords = extractSettlements(
          orders,
          context.bap_id ?? "",
          fastify.config.bppId,
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
          bpp_id: fastify.config.bppId,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "SENT",
        });

        // Sign and forward to BAP (fire-and-forget)
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bppId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body,
        });

        const bapUrl = `${context.bap_uri.replace(/\/+$/, "")}/${RspAction.receiver_recon}`;

        httpRequest(bapUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
        }).catch((err) => {
          logger.error(
            { err, url: bapUrl, transactionId: context.transaction_id },
            "Failed to send receiver_recon to BAP",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "receiver_recon dispatched to BAP",
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
  // POST /on_receiver_recon  -  BPP receives on_receiver_recon from BAP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OnReceiverReconRequest }>(
    `/${RspCallbackAction.on_receiver_recon}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: RspCallbackAction.on_receiver_recon, errors: validation.errors },
          "Invalid on_receiver_recon callback",
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
          action: RspCallbackAction.on_receiver_recon,
          bap_id: context.bap_id,
          bpp_id: fastify.config.bppId,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify seller webhook (fire-and-forget)
        notifyWebhook(
          fastify.config.bppId,
          RspCallbackAction.on_receiver_recon,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Webhook notification failed for on_receiver_recon",
          );
        });

        logger.info(
          { orderCount: orders.length, transactionId: context.transaction_id },
          "on_receiver_recon callback received and processed",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing on_receiver_recon callback");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing on_receiver_recon."),
        );
      }
    },
  );
};
