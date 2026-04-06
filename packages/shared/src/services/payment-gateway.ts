import { createLogger } from "../utils/logger.js";

const logger = createLogger("payment-gateway");

export enum PaymentMethod {
  UPI = "UPI",
  CARD = "CARD",
  NETBANKING = "NETBANKING",
  WALLET = "WALLET",
  COD = "COD",
}

export enum PaymentStatus {
  CREATED = "CREATED",
  AUTHORIZED = "AUTHORIZED",
  CAPTURED = "CAPTURED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
}

export interface CreatePaymentParams {
  orderId: string;
  amount: number; // in paise (INR * 100)
  currency: string; // "INR"
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  method?: PaymentMethod;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  gatewayPaymentId: string;
  gatewayOrderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentUrl?: string; // URL to redirect buyer for payment
  upiDeepLink?: string; // UPI intent link
  qrCode?: string; // QR code data
}

export interface RefundParams {
  gatewayPaymentId: string;
  amount: number; // in paise
  reason: string;
}

export interface RefundResult {
  refundId: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  amount: number;
}

export interface PaymentWebhookPayload {
  event: string;
  gatewayPaymentId: string;
  gatewayOrderId: string;
  status: PaymentStatus;
  amount: number;
  method?: string;
  errorCode?: string;
  errorDescription?: string;
}

/**
 * Abstract payment gateway interface.
 * Implement for each provider (Razorpay, Juspay, PayU).
 */
export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  verifyPayment(gatewayPaymentId: string, gatewaySignature: string, gatewayOrderId: string): Promise<boolean>;
  capturePayment(gatewayPaymentId: string, amount: number): Promise<PaymentResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  getPaymentStatus(gatewayPaymentId: string): Promise<PaymentResult>;
  parseWebhook(body: unknown, signature: string): PaymentWebhookPayload | null;
}

/**
 * Factory to create a payment gateway instance based on the configured provider.
 * Reads PAYMENT_GATEWAY env var: "razorpay" | "mock" (default: "mock").
 */
export function createPaymentGateway(): PaymentGateway {
  const provider = process.env["PAYMENT_GATEWAY"] ?? "mock";

  switch (provider) {
    case "razorpay": {
      const keyId = process.env["RAZORPAY_KEY_ID"];
      const keySecret = process.env["RAZORPAY_KEY_SECRET"];
      const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"];

      if (!keyId || !keySecret || !webhookSecret) {
        logger.error("Razorpay credentials missing. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET");
        throw new Error("Razorpay credentials not configured");
      }

      // Dynamic import avoided: direct require for tree-shaking
      const { RazorpayGateway } = require("./razorpay-gateway.js");
      return new RazorpayGateway({ keyId, keySecret, webhookSecret });
    }

    case "mock": {
      const { MockPaymentGateway } = require("./mock-payment-gateway.js");
      return new MockPaymentGateway();
    }

    default:
      logger.warn({ provider }, "Unknown payment gateway provider, falling back to mock");
      const { MockPaymentGateway: Mock } = require("./mock-payment-gateway.js");
      return new Mock();
  }
}
