import { createHmac } from "node:crypto";
import { request } from "undici";
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

const logger = createLogger("razorpay");

export class RazorpayGateway implements PaymentGateway {
  private keyId: string;
  private keySecret: string;
  private baseUrl = "https://api.razorpay.com/v1";
  private webhookSecret: string;

  constructor(config: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  }) {
    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret;
  }

  private get authHeader(): string {
    return "Basic " + Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    // Step 1: Create Razorpay order
    const orderRes = await request(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        receipt: params.orderId,
        notes: {
          ondc_order_id: params.orderId,
          ...params.metadata,
        },
      }),
    });

    const order = (await orderRes.body.json()) as Record<string, any>;
    if (orderRes.statusCode !== 200) {
      logger.error({ order, statusCode: orderRes.statusCode }, "Failed to create Razorpay order");
      throw new Error(`Razorpay order creation failed: ${order.error?.description || "Unknown error"}`);
    }

    logger.info({ orderId: params.orderId, razorpayOrderId: order.id }, "Razorpay order created");

    return {
      gatewayPaymentId: "", // Populated after buyer completes payment
      gatewayOrderId: order.id,
      status: PaymentStatus.CREATED,
      amount: order.amount,
      currency: order.currency,
      paymentUrl: `https://api.razorpay.com/v1/checkout/embedded?key_id=${this.keyId}&order_id=${order.id}`,
    };
  }

  verifyPayment(
    gatewayPaymentId: string,
    gatewaySignature: string,
    gatewayOrderId: string,
  ): Promise<boolean> {
    const expectedSignature = createHmac("sha256", this.keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    const isValid = expectedSignature === gatewaySignature;
    if (!isValid) {
      logger.warn({ gatewayPaymentId, gatewayOrderId }, "Razorpay payment signature verification failed");
    }
    return Promise.resolve(isValid);
  }

  async capturePayment(gatewayPaymentId: string, amount: number): Promise<PaymentResult> {
    const res = await request(`${this.baseUrl}/payments/${gatewayPaymentId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
      body: JSON.stringify({ amount, currency: "INR" }),
    });

    const payment = (await res.body.json()) as Record<string, any>;
    if (res.statusCode !== 200) {
      logger.error({ payment, statusCode: res.statusCode }, "Failed to capture Razorpay payment");
      throw new Error(`Razorpay capture failed: ${payment.error?.description || "Unknown error"}`);
    }

    return {
      gatewayPaymentId: payment.id,
      gatewayOrderId: payment.order_id,
      status: this.mapStatus(payment.status),
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const res = await request(`${this.baseUrl}/payments/${params.gatewayPaymentId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        amount: params.amount,
        notes: { reason: params.reason },
      }),
    });

    const refund = (await res.body.json()) as Record<string, any>;
    if (res.statusCode !== 200) {
      logger.error({ refund, statusCode: res.statusCode }, "Failed to create Razorpay refund");
      throw new Error(`Razorpay refund failed: ${refund.error?.description || "Unknown error"}`);
    }

    return {
      refundId: refund.id,
      status: refund.status === "processed" ? "PROCESSED" : "PENDING",
      amount: refund.amount,
    };
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<PaymentResult> {
    const res = await request(`${this.baseUrl}/payments/${gatewayPaymentId}`, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });

    const payment = (await res.body.json()) as Record<string, any>;
    if (res.statusCode !== 200) {
      logger.error({ payment, statusCode: res.statusCode }, "Failed to fetch Razorpay payment status");
      throw new Error(`Razorpay status fetch failed: ${payment.error?.description || "Unknown error"}`);
    }

    return {
      gatewayPaymentId: payment.id,
      gatewayOrderId: payment.order_id,
      status: this.mapStatus(payment.status),
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  parseWebhook(body: unknown, signature: string): PaymentWebhookPayload | null {
    // Verify webhook signature
    const expectedSig = createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(body))
      .digest("hex");

    if (expectedSig !== signature) {
      logger.warn("Razorpay webhook signature mismatch");
      return null;
    }

    const event = body as Record<string, any>;
    const payment = event.payload?.payment?.entity;
    if (!payment) return null;

    return {
      event: event.event,
      gatewayPaymentId: payment.id,
      gatewayOrderId: payment.order_id,
      status: this.mapStatus(payment.status),
      amount: payment.amount,
      method: payment.method,
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
    };
  }

  private mapStatus(razorpayStatus: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      created: PaymentStatus.CREATED,
      authorized: PaymentStatus.AUTHORIZED,
      captured: PaymentStatus.CAPTURED,
      failed: PaymentStatus.FAILED,
      refunded: PaymentStatus.REFUNDED,
    };
    return map[razorpayStatus] || PaymentStatus.CREATED;
  }
}
