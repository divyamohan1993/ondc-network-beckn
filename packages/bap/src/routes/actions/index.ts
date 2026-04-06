import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknAction,
  validateBecknRequest,
  ack,
  nack,
  transactions,
  payments,
  createLogger,
  createPaymentGateway,
  isNetworkCancellation,
  maskPiiInBody,
  buildAuthHeader,
  PaymentMethod,
} from "@ondc/shared";
import type { BecknRequest, PaymentGateway } from "@ondc/shared";
import { BecknClient } from "../../services/beckn-client.js";
import type { ActionQueueService } from "../../services/action-queue.js";

const logger = createLogger("bap-actions");

/**
 * All 10 Beckn actions that the BAP can send outward.
 * - search: routed through the gateway
 * - all others: sent directly to the BPP
 */
const BECKN_ACTIONS = Object.values(BecknAction);

/**
 * Register all 10 Beckn action routes dynamically.
 *
 * Each route:
 *   POST /{action}
 *   - Validates the incoming Beckn request body
 *   - Signs the request with the BAP's Ed25519 private key
 *   - For "search": sends to the gateway URL
 *   - For all others: sends directly to the BPP URL from context.bpp_uri
 *   - Logs the transaction in the database
 *   - Returns ACK
 */
export const registerActionRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const becknClient = new BecknClient();

  let paymentGateway: PaymentGateway | null = null;
  try {
    paymentGateway = createPaymentGateway();
  } catch (err) {
    logger.warn({ err }, "Payment gateway not configured, payment collection disabled");
  }

  for (const action of BECKN_ACTIONS) {
    fastify.post<{ Body: BecknRequest }>(
      `/${action}`,
      async (request, reply) => {
        // Validate
        const validation = validateBecknRequest(request.body);
        if (!validation.valid) {
          logger.warn(
            { action, errors: validation.errors },
            "Invalid Beckn request",
          );
          return reply.code(400).send(
            nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
          );
        }

        const body = request.body as BecknRequest;
        const { context } = body;

        try {
          // Resolve city from v1.1 flat field or v1.2 nested location
          const resolvedCity = context.city
            || context.location?.city?.code
            || "";

          // Log transaction as SENT (PII encrypted at rest)
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action,
            bap_id: context.bap_id,
            bpp_id: context.bpp_id ?? null,
            domain: context.domain,
            city: resolvedCity,
            request_body: maskPiiInBody(body, fastify.piiKey),
            status: "SENT",
          });

          // Payment collection for confirm action (non-COD orders)
          if (action === BecknAction.confirm && paymentGateway) {
            try {
              const orderData = (body.message as any)?.order;
              const paymentData = orderData?.payment;
              const paymentType = paymentData?.type ?? paymentData?.["@ondc/org/payment_type"];

              // Only collect payment for prepaid orders (ON-ORDER), skip COD (ON-FULFILLMENT)
              if (paymentType !== "ON-FULFILLMENT") {
                const quotePrice = orderData?.quote?.price;
                const amount = quotePrice
                  ? Math.round(parseFloat(quotePrice.value) * 100) // Convert INR to paise
                  : 0;

                if (amount > 0) {
                  const billing = orderData?.billing ?? {};
                  const orderId = orderData?.id ?? context.transaction_id;
                  const callbackUrl = `${fastify.config.bapUri}/payment/verify`;

                  const paymentResult = await paymentGateway.createPayment({
                    orderId,
                    amount,
                    currency: quotePrice?.currency ?? "INR",
                    description: `ONDC Order ${orderId}`,
                    customerName: billing.name ?? "",
                    customerEmail: billing.email ?? "",
                    customerPhone: billing.phone ?? "",
                    callbackUrl,
                    metadata: {
                      transaction_id: context.transaction_id,
                      bpp_id: context.bpp_id ?? "",
                      domain: context.domain,
                    },
                  });

                  // Persist payment record
                  await fastify.db.insert(payments).values({
                    order_id: orderId,
                    gateway_order_id: paymentResult.gatewayOrderId,
                    gateway_payment_id: paymentResult.gatewayPaymentId || null,
                    amount,
                    currency: quotePrice?.currency ?? "INR",
                    status: "CREATED",
                    customer_name: billing.name ?? null,
                    customer_email: billing.email ?? null,
                    customer_phone: billing.phone ?? null,
                    payment_url: paymentResult.paymentUrl ?? null,
                    metadata: {
                      transaction_id: context.transaction_id,
                      bpp_id: context.bpp_id,
                    },
                  });

                  logger.info(
                    { orderId, gatewayOrderId: paymentResult.gatewayOrderId, amount, paymentUrl: paymentResult.paymentUrl },
                    "Payment created for confirm action",
                  );

                  // Return ACK with payment URL so buyer app can redirect
                  return reply.code(200).send({
                    ...ack(),
                    payment: {
                      uri: paymentResult.paymentUrl,
                      gateway_order_id: paymentResult.gatewayOrderId,
                      status: paymentResult.status,
                    },
                  });
                }
              }
            } catch (paymentErr) {
              logger.error({ err: paymentErr, transactionId: context.transaction_id }, "Payment creation failed");
              return reply.code(500).send(
                nack("DOMAIN-ERROR", "23001", "Payment gateway error. Please retry."),
              );
            }
          }

          // Log force cancellation requests for audit trail
          if (action === BecknAction.cancel) {
            const cancelCode = (body.message as any)?.order?.cancellation?.reason?.id;
            if (cancelCode && isNetworkCancellation(cancelCode)) {
              logger.warn(
                { action, transactionId: context.transaction_id, cancellationCode: cancelCode, initiator: "network" },
                "Sending force/network-initiated cancellation request",
              );
            }
          }

          // Send the signed request
          if (action === BecknAction.search) {
            // Search goes through the gateway
            becknClient
              .sendToGateway(
                fastify.config.gatewayUrl,
                action,
                body,
                fastify.config.privateKey,
                fastify.config.bapId,
                fastify.config.uniqueKeyId,
              )
              .catch((err) => {
                logger.error(
                  { err, action, transactionId: context.transaction_id },
                  "Async gateway send failed",
                );
              });
          } else {
            // All other actions go directly to BPP via action queue for reliable delivery
            const bppUri = context.bpp_uri;
            if (!bppUri) {
              logger.warn(
                { action, transactionId: context.transaction_id },
                "Missing bpp_uri in context",
              );
              return reply.code(400).send(
                nack(
                  "CONTEXT-ERROR",
                  "10000",
                  "context.bpp_uri is required for non-search actions.",
                ),
              );
            }

            // Build auth header for BPP delivery
            const authHeader = buildAuthHeader({
              subscriberId: fastify.config.bapId,
              uniqueKeyId: fastify.config.uniqueKeyId,
              privateKey: fastify.config.privateKey,
              body,
            });

            // Extract trace headers for propagation
            const traceHeaders: Record<string, string> = {};
            const traceId = request.headers["x-trace-id"];
            if (typeof traceId === "string") traceHeaders["x-trace-id"] = traceId;
            const spanId = request.headers["x-span-id"];
            if (typeof spanId === "string") traceHeaders["x-span-id"] = spanId;

            const actionQueue = (fastify as any).actionQueue as ActionQueueService | undefined;
            if (actionQueue) {
              // Enqueue for reliable delivery with retry
              actionQueue
                .enqueue({
                  action,
                  bppUri: bppUri.replace(/\/+$/, ""),
                  body,
                  authHeader,
                  traceHeaders,
                  attempt: 0,
                  createdAt: new Date().toISOString(),
                })
                .catch((err) => {
                  logger.error(
                    { err, action, transactionId: context.transaction_id },
                    "Failed to enqueue action, falling back to direct send",
                  );
                  // Fallback: direct HTTP if queue fails
                  becknClient
                    .sendToBPP(
                      bppUri,
                      action,
                      body,
                      fastify.config.privateKey,
                      fastify.config.bapId,
                      fastify.config.uniqueKeyId,
                    )
                    .catch((fallbackErr) => {
                      logger.error(
                        { err: fallbackErr, action, transactionId: context.transaction_id },
                        "Fallback direct BPP send also failed",
                      );
                    });
                });
            } else {
              // No queue available, send directly (backward compatible)
              becknClient
                .sendToBPP(
                  bppUri,
                  action,
                  body,
                  fastify.config.privateKey,
                  fastify.config.bapId,
                  fastify.config.uniqueKeyId,
                )
                .catch((err) => {
                  logger.error(
                    { err, action, transactionId: context.transaction_id },
                    "Async BPP send failed",
                  );
                });
            }
          }

          logger.info(
            { action, transactionId: context.transaction_id },
            "Action dispatched",
          );

          return reply.code(200).send(ack());
        } catch (err) {
          logger.error({ err, action }, "Error processing action");
          return reply.code(500).send(
            nack("DOMAIN-ERROR", "23001", "Internal error processing action."),
          );
        }
      },
    );
  }
};
