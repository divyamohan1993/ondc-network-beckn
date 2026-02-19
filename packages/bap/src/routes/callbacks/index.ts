import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknCallbackAction,
  validateBecknRequest,
  ack,
  nack,
  transactions,
  orders,
  createVerifyAuthMiddleware,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { eq, and } from "drizzle-orm";
import { notifyWebhook } from "../../services/webhook.js";

const logger = createLogger("bap-callbacks");

/**
 * All 10 Beckn callback actions that the BAP receives from BPPs/Gateway.
 */
const BECKN_CALLBACKS = Object.values(BecknCallbackAction);

/**
 * Register all 10 Beckn callback routes dynamically.
 *
 * Each route:
 *   POST /on_{action}
 *   - Verifies the sender's Authorization header via registry lookup
 *   - Validates the Beckn request format
 *   - Updates the transaction log to CALLBACK_RECEIVED
 *   - Forwards to the buyer app's registered webhook URL (if any)
 *   - Returns ACK
 */
export const registerCallbackRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Set up auth verification middleware for all callback routes
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  for (const callbackAction of BECKN_CALLBACKS) {
    fastify.post<{ Body: BecknRequest }>(
      `/${callbackAction}`,
      { preHandler: verifyAuth },
      async (request, reply) => {
        // Validate
        const validation = validateBecknRequest(request.body);
        if (!validation.valid) {
          logger.warn(
            { callbackAction, errors: validation.errors },
            "Invalid callback request",
          );
          return reply.code(400).send(
            nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
          );
        }

        const body = request.body as BecknRequest;
        const { context } = body;

        try {
          // Update transaction status to CALLBACK_RECEIVED
          await fastify.db
            .update(transactions)
            .set({
              status: "CALLBACK_RECEIVED",
              response_body: body,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(transactions.transaction_id, context.transaction_id),
                eq(transactions.action, callbackAction.replace("on_", "")),
              ),
            );

          // Also log the callback as its own transaction entry
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action: callbackAction,
            bap_id: context.bap_id,
            bpp_id: context.bpp_id ?? null,
            domain: context.domain,
            city: context.city,
            request_body: body,
            status: "ACK",
          });

          // Update order state on relevant callbacks
          // BAP tracks full order lifecycle from on_select through completion
          const orderTrackingActions = [
            "on_select", "on_init", "on_confirm",
            "on_cancel", "on_status", "on_update",
          ];
          if (orderTrackingActions.includes(callbackAction)) {
            try {
              const orderData = (body.message as any)?.order;
              const orderId = orderData?.id ?? context.transaction_id;
              const orderState = orderData?.state;

              const existing = await fastify.db
                .select()
                .from(orders)
                .where(eq(orders.order_id, orderId))
                .limit(1);

              if (existing.length > 0) {
                // Update existing order
                const updateFields: Record<string, unknown> = {
                  updated_at: new Date(),
                };
                if (orderState) updateFields["state"] = orderState;
                if (orderData?.quote) updateFields["quote"] = orderData.quote;
                if (orderData?.payment) updateFields["payment"] = orderData.payment;
                if (orderData?.fulfillments) updateFields["fulfillments"] = orderData.fulfillments;

                await fastify.db
                  .update(orders)
                  .set(updateFields as any)
                  .where(eq(orders.order_id, orderId));
              } else if (callbackAction === "on_select" || callbackAction === "on_init") {
                // Create preliminary order record on BAP side for buyer tracking
                await fastify.db.insert(orders).values({
                  order_id: orderId,
                  transaction_id: context.transaction_id,
                  bap_id: context.bap_id,
                  bpp_id: context.bpp_id ?? "",
                  domain: context.domain,
                  city: context.city,
                  state: "CREATED",
                  items: orderData?.items ?? null,
                  provider: orderData?.provider ?? null,
                  quote: orderData?.quote ?? null,
                  billing: orderData?.billing ?? null,
                  fulfillments: orderData?.fulfillments ?? null,
                  payment: orderData?.payment ?? null,
                });
              }
            } catch (orderErr) {
              logger.error(
                { err: orderErr, callbackAction },
                "Failed to update order from callback",
              );
            }
          }

          // Forward to buyer app webhook (fire-and-forget)
          notifyWebhook(
            context.bap_id,
            callbackAction,
            body,
            fastify.redis,
          ).catch((err) => {
            logger.error(
              { err, callbackAction, transactionId: context.transaction_id },
              "Webhook notification failed",
            );
          });

          logger.info(
            { callbackAction, transactionId: context.transaction_id },
            "Callback received and processed",
          );

          return reply.code(200).send(ack());
        } catch (err) {
          logger.error({ err, callbackAction }, "Error processing callback");
          return reply.code(500).send(
            nack("INTERNAL-ERROR", "20000", "Internal error processing callback."),
          );
        }
      },
    );
  }
};
