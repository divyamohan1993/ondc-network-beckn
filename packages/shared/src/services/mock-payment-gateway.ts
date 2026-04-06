import { randomUUID } from "node:crypto";
import { createLogger } from "../utils/logger.js";
import type {
  PaymentGateway,
  CreatePaymentParams,
  PaymentResult,
  RefundParams,
  RefundResult,
  PaymentWebhookPayload,
} from "./payment-gateway.js";
import { PaymentStatus } from "./payment-gateway.js";

const logger = createLogger("mock-payment-gateway");

/**
 * Mock payment gateway for development and testing.
 * Simulates payment flow without moving real money.
 * All payments auto-succeed after creation.
 */
export class MockPaymentGateway implements PaymentGateway {
  private payments = new Map<string, PaymentResult>();

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const gatewayOrderId = `mock_order_${randomUUID().slice(0, 12)}`;
    const gatewayPaymentId = `mock_pay_${randomUUID().slice(0, 12)}`;

    const result: PaymentResult = {
      gatewayPaymentId,
      gatewayOrderId,
      status: PaymentStatus.CREATED,
      amount: params.amount,
      currency: params.currency,
      paymentUrl: `${params.callbackUrl}?mock=true&order_id=${gatewayOrderId}`,
    };

    this.payments.set(gatewayPaymentId, result);

    logger.info(
      { orderId: params.orderId, gatewayOrderId, gatewayPaymentId },
      "Mock payment created",
    );

    return result;
  }

  async verifyPayment(
    _gatewayPaymentId: string,
    _gatewaySignature: string,
    _gatewayOrderId: string,
  ): Promise<boolean> {
    // Mock always verifies successfully
    logger.info({ gatewayPaymentId: _gatewayPaymentId }, "Mock payment verification: pass");
    return true;
  }

  async capturePayment(gatewayPaymentId: string, amount: number): Promise<PaymentResult> {
    const existing = this.payments.get(gatewayPaymentId);
    const result: PaymentResult = {
      gatewayPaymentId,
      gatewayOrderId: existing?.gatewayOrderId ?? `mock_order_${randomUUID().slice(0, 8)}`,
      status: PaymentStatus.CAPTURED,
      amount,
      currency: "INR",
    };

    this.payments.set(gatewayPaymentId, result);
    logger.info({ gatewayPaymentId, amount }, "Mock payment captured");
    return result;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundId = `mock_rfnd_${randomUUID().slice(0, 12)}`;

    logger.info(
      { gatewayPaymentId: params.gatewayPaymentId, refundId, amount: params.amount, reason: params.reason },
      "Mock refund processed",
    );

    return {
      refundId,
      status: "PROCESSED",
      amount: params.amount,
    };
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<PaymentResult> {
    const existing = this.payments.get(gatewayPaymentId);
    if (existing) return existing;

    // Return a default captured state for unknown IDs
    return {
      gatewayPaymentId,
      gatewayOrderId: "",
      status: PaymentStatus.CAPTURED,
      amount: 0,
      currency: "INR",
    };
  }

  parseWebhook(body: unknown, _signature: string): PaymentWebhookPayload | null {
    // Mock accepts any webhook body as valid
    const event = body as Record<string, any>;

    if (!event.gatewayPaymentId) return null;

    return {
      event: event.event ?? "payment.captured",
      gatewayPaymentId: event.gatewayPaymentId,
      gatewayOrderId: event.gatewayOrderId ?? "",
      status: (event.status as PaymentStatus) ?? PaymentStatus.CAPTURED,
      amount: event.amount ?? 0,
      method: event.method,
    };
  }
}
