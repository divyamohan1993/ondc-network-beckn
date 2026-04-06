import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  createLogger,
  createPaymentGateway,
  payments,
  orders,
  NotificationService,
  NotificationEvent,
} from "@ondc/shared";
import type { PaymentGateway } from "@ondc/shared";
import { eq } from "drizzle-orm";
import { BecknClient } from "../services/beckn-client.js";

const logger = createLogger("bap-payment");

export const registerPaymentRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  let gateway: PaymentGateway;
  try {
    gateway = createPaymentGateway();
  } catch (err) {
    logger.error({ err }, "Failed to initialize payment gateway, payment routes disabled");
    return;
  }

  const becknClient = new BecknClient();

  // -----------------------------------------------------------------------
  // POST /payment/webhook -- Razorpay (or other gateway) webhook receiver
  // -----------------------------------------------------------------------
  fastify.post<{ Body: unknown }>(
    "/payment/webhook",
    async (request, reply) => {
      const signature =
        (request.headers["x-razorpay-signature"] as string) ??
        (request.headers["x-webhook-signature"] as string) ??
        "";

      const parsed = gateway.parseWebhook(request.body, signature);
      if (!parsed) {
        logger.warn("Payment webhook signature verification failed or payload invalid");
        return reply.code(400).send({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature invalid" } });
      }

      logger.info(
        { event: parsed.event, gatewayPaymentId: parsed.gatewayPaymentId, status: parsed.status },
        "Payment webhook received",
      );

      try {
        // Find payment record by gateway order ID
        const existing = await fastify.db
          .select()
          .from(payments)
          .where(eq(payments.gateway_order_id, parsed.gatewayOrderId))
          .limit(1);

        if (existing.length === 0) {
          logger.warn({ gatewayOrderId: parsed.gatewayOrderId }, "Payment record not found for webhook");
          return reply.code(200).send({ status: "ignored" });
        }

        const paymentRecord = existing[0];

        // Update payment record
        const updateFields: Record<string, unknown> = {
          status: parsed.status,
          gateway_payment_id: parsed.gatewayPaymentId,
          method: parsed.method ?? paymentRecord.method,
          error_code: parsed.errorCode ?? null,
          error_description: parsed.errorDescription ?? null,
          updated_at: new Date(),
        };

        await fastify.db
          .update(payments)
          .set(updateFields as any)
          .where(eq(payments.id, paymentRecord.id));

        // If payment captured, look up the order and send confirm to BPP
        if (parsed.status === "CAPTURED") {
          logger.info(
            { orderId: paymentRecord.order_id, gatewayPaymentId: parsed.gatewayPaymentId },
            "Payment captured, order confirmed via payment webhook",
          );

          // Update order payment status
          await fastify.db
            .update(orders)
            .set({
              payment: {
                status: "PAID",
                type: "ON-ORDER",
                collected_by: "BAP",
                gateway_payment_id: parsed.gatewayPaymentId,
              },
              updated_at: new Date(),
            } as any)
            .where(eq(orders.order_id, paymentRecord.order_id));

          // Notify buyer: payment received
          fastify.notifications
            .send(
              NotificationService.buildOrderNotification(
                NotificationEvent.PAYMENT_RECEIVED,
                { orderId: paymentRecord.order_id, amount: paymentRecord.amount },
              ),
            )
            .catch((err: unknown) => logger.error({ err, orderId: paymentRecord.order_id }, "PAYMENT_RECEIVED notification failed"));
        }

        // If payment failed, mark order payment as failed
        if (parsed.status === "FAILED") {
          logger.warn(
            { orderId: paymentRecord.order_id, errorCode: parsed.errorCode, errorDescription: parsed.errorDescription },
            "Payment failed",
          );

          await fastify.db
            .update(orders)
            .set({
              payment: {
                status: "NOT-PAID",
                type: "ON-ORDER",
                error_code: parsed.errorCode,
                error_description: parsed.errorDescription,
              },
              updated_at: new Date(),
            } as any)
            .where(eq(orders.order_id, paymentRecord.order_id));

          // Notify buyer: payment failed
          fastify.notifications
            .send(
              NotificationService.buildOrderNotification(
                NotificationEvent.PAYMENT_FAILED,
                { orderId: paymentRecord.order_id, amount: paymentRecord.amount },
              ),
            )
            .catch((err: unknown) => logger.error({ err, orderId: paymentRecord.order_id }, "PAYMENT_FAILED notification failed"));
        }

        return reply.code(200).send({ status: "ok" });
      } catch (err) {
        logger.error({ err }, "Error processing payment webhook");
        return reply.code(500).send({ error: { code: "INTERNAL", message: "Webhook processing failed" } });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /payment/verify -- Buyer app calls after completing Razorpay checkout
  // -----------------------------------------------------------------------
  fastify.post<{
    Body: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    };
  }>("/payment/verify", async (request, reply) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = request.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return reply.code(400).send({
        error: { code: "MISSING_PARAMS", message: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required" },
      });
    }

    try {
      const isValid = await gateway.verifyPayment(razorpay_payment_id, razorpay_signature, razorpay_order_id);
      if (!isValid) {
        logger.warn({ razorpay_payment_id, razorpay_order_id }, "Payment verification failed");
        return reply.code(400).send({
          error: { code: "VERIFICATION_FAILED", message: "Payment signature verification failed" },
        });
      }

      // Find and update the payment record
      const existing = await fastify.db
        .select()
        .from(payments)
        .where(eq(payments.gateway_order_id, razorpay_order_id))
        .limit(1);

      if (existing.length === 0) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Payment record not found" },
        });
      }

      await fastify.db
        .update(payments)
        .set({
          gateway_payment_id: razorpay_payment_id,
          gateway_signature: razorpay_signature,
          status: "CAPTURED",
          updated_at: new Date(),
        } as any)
        .where(eq(payments.id, existing[0].id));

      // Update order payment status
      await fastify.db
        .update(orders)
        .set({
          payment: {
            status: "PAID",
            type: "ON-ORDER",
            collected_by: "BAP",
            gateway_payment_id: razorpay_payment_id,
          },
          updated_at: new Date(),
        } as any)
        .where(eq(orders.order_id, existing[0].order_id));

      logger.info(
        { razorpay_payment_id, razorpay_order_id, orderId: existing[0].order_id },
        "Payment verified and captured",
      );

      // Notify buyer: payment received
      fastify.notifications
        .send(
          NotificationService.buildOrderNotification(
            NotificationEvent.PAYMENT_RECEIVED,
            { orderId: existing[0].order_id, amount: existing[0].amount },
          ),
        )
        .catch((err: unknown) => logger.error({ err, orderId: existing[0].order_id }, "PAYMENT_RECEIVED notification failed"));

      return reply.code(200).send({
        status: "CAPTURED",
        orderId: existing[0].order_id,
        gatewayPaymentId: razorpay_payment_id,
      });
    } catch (err) {
      logger.error({ err }, "Error verifying payment");
      return reply.code(500).send({
        error: { code: "INTERNAL", message: "Payment verification failed" },
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /payment/status/:orderId -- Current payment status for an order
  // -----------------------------------------------------------------------
  fastify.get<{ Params: { orderId: string } }>(
    "/payment/status/:orderId",
    async (request, reply) => {
      const { orderId } = request.params;

      try {
        const existing = await fastify.db
          .select()
          .from(payments)
          .where(eq(payments.order_id, orderId))
          .limit(1);

        if (existing.length === 0) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "No payment found for this order" },
          });
        }

        const record = existing[0];

        // If we have a gateway payment ID, fetch live status
        if (record.gateway_payment_id) {
          try {
            const liveStatus = await gateway.getPaymentStatus(record.gateway_payment_id);

            // Update local record if status changed
            if (liveStatus.status !== record.status) {
              await fastify.db
                .update(payments)
                .set({
                  status: liveStatus.status,
                  updated_at: new Date(),
                } as any)
                .where(eq(payments.id, record.id));
            }

            return reply.code(200).send({
              orderId: record.order_id,
              status: liveStatus.status,
              amount: record.amount,
              currency: record.currency,
              gatewayPaymentId: record.gateway_payment_id,
              gatewayOrderId: record.gateway_order_id,
              method: record.method,
              refundId: record.refund_id,
              refundAmount: record.refund_amount,
              refundStatus: record.refund_status,
              createdAt: record.created_at,
              updatedAt: record.updated_at,
            });
          } catch (gatewayErr) {
            logger.warn({ err: gatewayErr, orderId }, "Failed to fetch live payment status, returning cached");
          }
        }

        return reply.code(200).send({
          orderId: record.order_id,
          status: record.status,
          amount: record.amount,
          currency: record.currency,
          gatewayPaymentId: record.gateway_payment_id,
          gatewayOrderId: record.gateway_order_id,
          method: record.method,
          refundId: record.refund_id,
          refundAmount: record.refund_amount,
          refundStatus: record.refund_status,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
        });
      } catch (err) {
        logger.error({ err, orderId }, "Error fetching payment status");
        return reply.code(500).send({
          error: { code: "INTERNAL", message: "Failed to fetch payment status" },
        });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /payment/refund -- Initiate a refund for an order
  // -----------------------------------------------------------------------
  fastify.post<{
    Body: {
      orderId: string;
      amount?: number; // partial refund amount in paise, defaults to full
      reason: string;
    };
  }>("/payment/refund", async (request, reply) => {
    const { orderId, reason } = request.body;

    if (!orderId || !reason) {
      return reply.code(400).send({
        error: { code: "MISSING_PARAMS", message: "orderId and reason are required" },
      });
    }

    try {
      const existing = await fastify.db
        .select()
        .from(payments)
        .where(eq(payments.order_id, orderId))
        .limit(1);

      if (existing.length === 0) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "No payment found for this order" },
        });
      }

      const record = existing[0];
      if (!record.gateway_payment_id) {
        return reply.code(400).send({
          error: { code: "NO_PAYMENT", message: "No gateway payment ID found, cannot refund" },
        });
      }

      if (record.status !== "CAPTURED") {
        return reply.code(400).send({
          error: { code: "INVALID_STATE", message: `Cannot refund payment in ${record.status} state` },
        });
      }

      const refundAmount = request.body.amount ?? record.amount;

      const refundResult = await gateway.refund({
        gatewayPaymentId: record.gateway_payment_id,
        amount: refundAmount,
        reason,
      });

      const newStatus = refundAmount >= record.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";

      await fastify.db
        .update(payments)
        .set({
          refund_id: refundResult.refundId,
          refund_amount: refundAmount,
          refund_status: refundResult.status,
          status: newStatus,
          updated_at: new Date(),
        } as any)
        .where(eq(payments.id, record.id));

      logger.info(
        { orderId, refundId: refundResult.refundId, refundAmount, status: refundResult.status },
        "Refund initiated",
      );

      // Notify buyer: refund completed
      fastify.notifications
        .send(
          NotificationService.buildOrderNotification(
            NotificationEvent.REFUND_COMPLETED,
            { orderId, amount: refundAmount },
          ),
        )
        .catch((err: unknown) => logger.error({ err, orderId }, "REFUND_COMPLETED notification failed"));

      return reply.code(200).send({
        refundId: refundResult.refundId,
        status: refundResult.status,
        amount: refundAmount,
      });
    } catch (err) {
      logger.error({ err, orderId }, "Error processing refund");
      return reply.code(500).send({
        error: { code: "INTERNAL", message: "Refund processing failed" },
      });
    }
  });
};
