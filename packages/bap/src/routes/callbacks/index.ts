import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknCallbackAction,
  OrderState,
  isOrderState,
  isValidOrderTransition,
  validateBecknRequest,
  ack,
  nack,
  transactions,
  orders,
  payments,
  createVerifyAuthMiddleware,
  createLogger,
  createPaymentGateway,
  SettlementService,
  SettlementBasis,
  sanitizeCatalog,
  maskPiiInBody,
  NotificationService,
  NotificationEvent,
} from "@ondc/shared";
import type { BecknRequest, PaymentGateway } from "@ondc/shared";
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
  let paymentGateway: PaymentGateway | null = null;
  try {
    paymentGateway = createPaymentGateway();
  } catch {
    logger.warn("Payment gateway not configured, refund on cancel disabled");
  }

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
              response_body: maskPiiInBody(body, fastify.piiKey),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(transactions.transaction_id, context.transaction_id),
                eq(transactions.action, callbackAction.replace("on_", "")),
              ),
            );

          // Also log the callback as its own transaction entry (PII encrypted at rest)
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action: callbackAction,
            bap_id: context.bap_id,
            bpp_id: context.bpp_id ?? null,
            domain: context.domain,
            city: context.city,
            request_body: maskPiiInBody(body, fastify.piiKey),
            status: "ACK",
          });

          // Update order state on relevant callbacks
          // BAP tracks full order lifecycle from on_select through completion
          const orderTrackingActions = [
            "on_select", "on_init", "on_confirm",
            "on_cancel", "on_status", "on_update",
          ];

          // Enriched data for on_status webhook forwarding
          let enrichedData: Record<string, unknown> | undefined;

          if (orderTrackingActions.includes(callbackAction)) {
            try {
              const orderData = (body.message as any)?.order;
              const orderId = orderData?.id ?? context.transaction_id;
              let orderState = orderData?.state;

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
                if (orderState) {
                  if (isOrderState(orderState)) {
                    const currentState = existing[0].state as string;
                    if (isOrderState(currentState) && !isValidOrderTransition(currentState as OrderState, orderState as OrderState)) {
                      logger.warn({
                        orderId,
                        currentState,
                        attemptedState: orderState,
                        action: callbackAction,
                      }, "Invalid order state transition from BPP -- rejecting state update");
                      // Skip state update but continue processing other fields
                      orderState = undefined;
                    } else {
                      updateFields["state"] = orderState;
                    }
                  } else {
                    logger.warn(
                      { orderState, orderId, callbackAction },
                      "Invalid order state received from BPP callback, keeping existing state",
                    );
                  }
                }
                if (orderData?.quote) updateFields["quote"] = orderData.quote;
                if (orderData?.payment) updateFields["payment"] = orderData.payment;
                if (orderData?.fulfillments) updateFields["fulfillments"] = orderData.fulfillments;

                await fastify.db
                  .update(orders)
                  .set(updateFields as any)
                  .where(eq(orders.order_id, orderId));
              } else if (callbackAction === "on_select" || callbackAction === "on_init") {
                // Create preliminary order record on BAP side for buyer tracking
                const resolvedCity = context.city
                  || context.location?.city?.code
                  || "";

                await fastify.db.insert(orders).values({
                  order_id: orderId,
                  transaction_id: context.transaction_id,
                  bap_id: context.bap_id,
                  bpp_id: context.bpp_id ?? "",
                  domain: context.domain,
                  city: resolvedCity,
                  state: OrderState.Created,
                  items: orderData?.items ?? null,
                  provider: orderData?.provider ?? null,
                  quote: orderData?.quote ?? null,
                  billing: orderData?.billing ?? null,
                  fulfillments: orderData?.fulfillments ?? null,
                  payment: orderData?.payment ?? null,
                });
              }

              // on_status enrichment: extract fulfillment tracking and settlement details
              if (callbackAction === "on_status" && orderData) {
                const fulfillments = orderData.fulfillments as Array<Record<string, any>> | undefined;
                const activeFulfillment = fulfillments?.find((f: any) => f.state?.descriptor?.code) ?? fulfillments?.[0];

                const fulfillmentState = activeFulfillment?.state?.descriptor?.code ?? null;
                const trackingUrl = activeFulfillment?.tracking ?? activeFulfillment?.["@ondc/org/tracking_url"] ?? null;
                const agentDetails = activeFulfillment?.agent ?? null;
                const expectedDelivery = activeFulfillment?.end?.time?.range?.end
                  ?? activeFulfillment?.end?.time?.timestamp
                  ?? null;

                const paymentData = orderData.payment;
                const settlementStatus = paymentData?.status
                  ?? paymentData?.["@ondc/org/settlement_details"]?.[0]?.settlement_status
                  ?? null;

                enrichedData = {
                  order_id: orderId,
                  order_state: orderState,
                  fulfillment: {
                    state: fulfillmentState,
                    tracking_url: trackingUrl,
                    agent: agentDetails,
                    expected_delivery: expectedDelivery,
                  },
                  settlement: {
                    status: settlementStatus,
                    details: paymentData?.["@ondc/org/settlement_details"] ?? null,
                  },
                };

                logger.info(
                  { orderId, fulfillmentState, trackingUrl, settlementStatus },
                  "on_status enrichment extracted",
                );
              }
            } catch (orderErr) {
              logger.error(
                { err: orderErr, callbackAction },
                "Failed to update order from callback",
              );
            }
          }

          // Create settlement instruction on BAP side for on_confirm
          if (callbackAction === "on_confirm") {
            try {
              const settlementService = new SettlementService(fastify.db);
              const orderData = (body.message as any)?.order;
              const orderAmount = parseFloat(
                orderData?.quote?.price?.value ?? "0",
              );
              if (orderAmount > 0) {
                const orderId = orderData?.id ?? context.transaction_id;
                const paymentTags: any[] =
                  orderData?.payment?.tags ??
                  orderData?.payment?.["@ondc/org/settlement_details"]?.tags ??
                  [];
                const findTag = (code: string): string | undefined =>
                  paymentTags
                    .flatMap((t: any) => t.list ?? [])
                    .find((l: any) => l.code === code)?.value;

                const settlementBasisRaw = findTag("settlement_basis");
                const settlementBasis =
                  (Object.values(SettlementBasis) as string[]).includes(settlementBasisRaw ?? "")
                    ? (settlementBasisRaw as SettlementBasis)
                    : SettlementBasis.Delivery;

                const withholdingPercent = parseFloat(findTag("withholding_amount") ?? "10");
                const finderFeeAmount = parseFloat(
                  orderData?.payment?.["@ondc/org/buyer_app_finder_fee_amount"] ??
                  findTag("@ondc/org/buyer_app_finder_fee_amount") ??
                  "0",
                );

                await settlementService.createSettlementInstruction({
                  orderId,
                  collectorSubscriberId: context.bap_id,
                  receiverSubscriberId: context.bpp_id ?? "",
                  amount: orderAmount,
                  settlementBasis,
                  settlementWindowDays: 1,
                  withholdingPercent,
                  finderFeeAmount,
                  platformFeeAmount: 0,
                });
              }
            } catch (settlementErr) {
              logger.error(
                { err: settlementErr, callbackAction, transactionId: context.transaction_id },
                "BAP settlement tracking failed",
              );
            }
          }

          // Refund payment on cancellation (on_cancel callback)
          if (callbackAction === "on_cancel" && paymentGateway) {
            try {
              const orderData = (body.message as any)?.order;
              const orderId = orderData?.id ?? context.transaction_id;
              const cancellationReason = orderData?.cancellation?.reason?.id ?? "Order cancelled";

              // Look up payment for this order
              const paymentRecords = await fastify.db
                .select()
                .from(payments)
                .where(eq(payments.order_id, orderId))
                .limit(1);

              if (paymentRecords.length > 0) {
                const paymentRecord = paymentRecords[0];

                // Only refund if payment was captured
                if (paymentRecord.status === "CAPTURED" && paymentRecord.gateway_payment_id) {
                  const refundResult = await paymentGateway.refund({
                    gatewayPaymentId: paymentRecord.gateway_payment_id,
                    amount: paymentRecord.amount,
                    reason: `Order cancelled: ${cancellationReason}`,
                  });

                  await fastify.db
                    .update(payments)
                    .set({
                      refund_id: refundResult.refundId,
                      refund_amount: paymentRecord.amount,
                      refund_status: refundResult.status,
                      status: "REFUNDED",
                      updated_at: new Date(),
                    } as any)
                    .where(eq(payments.id, paymentRecord.id));

                  logger.info(
                    { orderId, refundId: refundResult.refundId, amount: paymentRecord.amount },
                    "Refund initiated for cancelled order",
                  );
                }
              }
            } catch (refundErr) {
              logger.error(
                { err: refundErr, callbackAction, transactionId: context.transaction_id },
                "Refund on cancellation failed",
              );
            }
          }

          // --- Buyer/Seller notifications ---
          try {
            const orderData = (body.message as any)?.order;
            const orderId = orderData?.id ?? context.transaction_id;
            const buyerPhone = orderData?.billing?.phone ?? orderData?.fulfillments?.[0]?.end?.contact?.phone;
            const buyerEmail = orderData?.billing?.email ?? orderData?.fulfillments?.[0]?.end?.contact?.email;
            const sellerWebhookUrl = orderData?.provider?.["@ondc/org/webhook_url"];
            const itemSummary = orderData?.items
              ?.map((i: any) => i.descriptor?.name ?? i.id)
              ?.slice(0, 3)
              ?.join(", ");
            const amount = orderData?.quote?.price?.value
              ? parseFloat(orderData.quote.price.value) * 100
              : undefined;

            if (callbackAction === "on_confirm") {
              // Buyer: order confirmed
              fastify.notifications
                .send(
                  NotificationService.buildOrderNotification(
                    NotificationEvent.ORDER_CONFIRMED,
                    { orderId, buyerPhone, buyerEmail, itemSummary, amount },
                  ),
                )
                .catch((err: unknown) => logger.error({ err, orderId }, "ORDER_CONFIRMED notification failed"));

              // Seller: new order webhook
              if (sellerWebhookUrl) {
                fastify.notifications
                  .send(
                    NotificationService.buildOrderNotification(
                      NotificationEvent.NEW_ORDER,
                      { orderId, sellerWebhookUrl, itemSummary, amount },
                    ),
                  )
                  .catch((err: unknown) => logger.error({ err, orderId }, "NEW_ORDER notification failed"));
              }
            }

            if (callbackAction === "on_cancel") {
              fastify.notifications
                .send(
                  NotificationService.buildOrderNotification(
                    NotificationEvent.ORDER_CANCELLED,
                    { orderId, buyerPhone, buyerEmail, amount },
                  ),
                )
                .catch((err: unknown) => logger.error({ err, orderId }, "ORDER_CANCELLED notification failed"));

              fastify.notifications
                .send(
                  NotificationService.buildOrderNotification(
                    NotificationEvent.REFUND_INITIATED,
                    { orderId, buyerPhone, buyerEmail, amount },
                  ),
                )
                .catch((err: unknown) => logger.error({ err, orderId }, "REFUND_INITIATED notification failed"));
            }

            if (callbackAction === "on_status" && orderData) {
              const fulfillments = orderData.fulfillments as Array<Record<string, any>> | undefined;
              const activeFulfillment = fulfillments?.find((f: any) => f.state?.descriptor?.code) ?? fulfillments?.[0];
              const fulfillmentState = activeFulfillment?.state?.descriptor?.code;
              const trackingUrl = activeFulfillment?.tracking ?? activeFulfillment?.["@ondc/org/tracking_url"];

              if (fulfillmentState === "Order-delivered") {
                fastify.notifications
                  .send(
                    NotificationService.buildOrderNotification(
                      NotificationEvent.ORDER_DELIVERED,
                      { orderId, buyerPhone, buyerEmail },
                    ),
                  )
                  .catch((err: unknown) => logger.error({ err, orderId }, "ORDER_DELIVERED notification failed"));
              } else if (fulfillmentState === "Order-picked-up" || fulfillmentState === "Out-for-delivery") {
                const event =
                  fulfillmentState === "Order-picked-up"
                    ? NotificationEvent.ORDER_SHIPPED
                    : NotificationEvent.FULFILLMENT_UPDATE;
                fastify.notifications
                  .send(
                    NotificationService.buildOrderNotification(event, {
                      orderId,
                      buyerPhone,
                      buyerEmail,
                      trackingUrl,
                      itemSummary: fulfillmentState === "Out-for-delivery" ? "Out for delivery" : undefined,
                    }),
                  )
                  .catch((err: unknown) => logger.error({ err, orderId }, "Fulfillment notification failed"));
              }
            }
          } catch (notifErr) {
            logger.error({ err: notifErr, callbackAction }, "Notification dispatch failed");
          }

          // Sanitize catalog data in on_search responses before forwarding
          let sanitizedBody: unknown = body;
          if (callbackAction === "on_search" && (body.message as any)?.catalog) {
            const cloned = JSON.parse(JSON.stringify(body));
            cloned.message.catalog = sanitizeCatalog(cloned.message.catalog);
            sanitizedBody = cloned;
          }

          // Forward to buyer app webhook (fire-and-forget)
          // on_status includes enriched fulfillment + settlement data
          const webhookPayload = enrichedData
            ? { ...(sanitizedBody as Record<string, unknown>), _enriched: enrichedData }
            : sanitizedBody;

          notifyWebhook(
            context.bap_id,
            callbackAction,
            webhookPayload,
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
            nack("DOMAIN-ERROR", "23001", "Internal error processing callback."),
          );
        }
      },
    );
  }
};
