import { request } from "undici";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("notifications");

export enum NotificationChannel {
  EMAIL = "EMAIL",
  SMS = "SMS",
  WEBHOOK = "WEBHOOK",
  PUSH = "PUSH",
}

export enum NotificationEvent {
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  ORDER_SHIPPED = "ORDER_SHIPPED",
  ORDER_DELIVERED = "ORDER_DELIVERED",
  ORDER_RETURNED = "ORDER_RETURNED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  REFUND_INITIATED = "REFUND_INITIATED",
  REFUND_COMPLETED = "REFUND_COMPLETED",
  ISSUE_RAISED = "ISSUE_RAISED",
  ISSUE_RESOLVED = "ISSUE_RESOLVED",
  ISSUE_ESCALATED = "ISSUE_ESCALATED",
  FULFILLMENT_UPDATE = "FULFILLMENT_UPDATE",
  NEW_ORDER = "NEW_ORDER",
}

export interface NotificationPayload {
  event: NotificationEvent;
  recipientPhone?: string;
  recipientEmail?: string;
  webhookUrl?: string;
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
  orderId?: string;
  transactionId?: string;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

interface SmsConfig {
  provider: "msg91" | "twilio" | "mock";
  apiKey: string;
  senderId: string;
  templateId?: string;
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

export class NotificationService {
  private emailConfig?: EmailConfig;
  private smsConfig?: SmsConfig;
  private webhookRetryQueue: Map<
    string,
    { payload: NotificationPayload; attempts: number; nextRetry: number }
  > = new Map();
  private retryInterval?: ReturnType<typeof setInterval>;

  constructor(config?: { email?: EmailConfig; sms?: SmsConfig }) {
    this.emailConfig = config?.email;
    this.smsConfig = config?.sms;
  }

  /**
   * Send a notification across configured channels.
   */
  async send(
    payload: NotificationPayload,
  ): Promise<{ sent: string[]; failed: string[] }> {
    const sent: string[] = [];
    const failed: string[] = [];

    const tasks: Promise<void>[] = [];

    if (payload.recipientEmail && this.emailConfig) {
      tasks.push(
        this.sendEmail(payload)
          .then(() => {
            sent.push("email");
          })
          .catch((err) => {
            logger.error(
              { err, email: payload.recipientEmail?.slice(0, 3) + "***" },
              "Email send failed",
            );
            failed.push("email");
          }),
      );
    }

    if (payload.recipientPhone && this.smsConfig) {
      tasks.push(
        this.sendSms(payload)
          .then(() => {
            sent.push("sms");
          })
          .catch((err) => {
            logger.error({ err }, "SMS send failed");
            failed.push("sms");
          }),
      );
    }

    if (payload.webhookUrl) {
      tasks.push(
        this.sendWebhook(payload)
          .then(() => {
            sent.push("webhook");
          })
          .catch(() => {
            const id = `${payload.orderId || "unknown"}-${Date.now()}`;
            this.webhookRetryQueue.set(id, {
              payload,
              attempts: 1,
              nextRetry: Date.now() + 5000,
            });
            failed.push("webhook");
          }),
      );
    }

    await Promise.allSettled(tasks);

    logger.info(
      { event: payload.event, sent, failed, orderId: payload.orderId },
      "Notification dispatched",
    );
    return { sent, failed };
  }

  /**
   * Send email via SMTP using nodemailer.
   */
  private async sendEmail(payload: NotificationPayload): Promise<void> {
    if (!this.emailConfig) throw new Error("Email not configured");

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: this.emailConfig.host,
        port: this.emailConfig.port,
        secure: this.emailConfig.secure,
        auth: {
          user: this.emailConfig.user,
          pass: this.emailConfig.pass,
        },
      });

      await transporter.sendMail({
        from: this.emailConfig.from,
        to: payload.recipientEmail,
        subject:
          payload.subject ||
          `ONDC: ${payload.event.replace(/_/g, " ").toLowerCase()}`,
        text: payload.body,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2>${payload.subject || payload.event.replace(/_/g, " ")}</h2>
          <p>${payload.body}</p>
          ${payload.orderId ? `<p><strong>Order ID:</strong> ${payload.orderId}</p>` : ""}
          <hr><p style="color:#666;font-size:12px">This is an automated notification from the ONDC network.</p>
        </div>`,
      });

      logger.info(
        {
          to: payload.recipientEmail?.slice(0, 3) + "***",
          event: payload.event,
        },
        "Email sent",
      );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND"
      ) {
        logger.warn(
          "nodemailer not installed, skipping email. Install with: pnpm add nodemailer",
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Send SMS via MSG91 or Twilio.
   */
  private async sendSms(payload: NotificationPayload): Promise<void> {
    if (!this.smsConfig) throw new Error("SMS not configured");

    if (this.smsConfig.provider === "msg91") {
      await this.sendSmsMSG91(payload);
    } else if (this.smsConfig.provider === "twilio") {
      await this.sendSmsTwilio(payload);
    } else {
      logger.info(
        {
          phone: payload.recipientPhone?.slice(-4),
          body: payload.body.slice(0, 50),
        },
        "Mock SMS sent",
      );
    }
  }

  private async sendSmsMSG91(payload: NotificationPayload): Promise<void> {
    const res = await request("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: this.smsConfig!.apiKey,
      },
      body: JSON.stringify({
        template_id: this.smsConfig!.templateId,
        sender: this.smsConfig!.senderId,
        mobiles: payload.recipientPhone,
        body: payload.body,
        ...(payload.data || {}),
      }),
    });

    if (res.statusCode !== 200) {
      const body = await res.body.text();
      throw new Error(`MSG91 error ${res.statusCode}: ${body}`);
    }
    logger.info(
      { phone: payload.recipientPhone?.slice(-4) },
      "SMS sent via MSG91",
    );
  }

  private async sendSmsTwilio(payload: NotificationPayload): Promise<void> {
    const accountSid = this.smsConfig!.accountSid!;
    const authToken = this.smsConfig!.authToken!;

    const res = await request(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          To: payload.recipientPhone!,
          From: this.smsConfig!.fromNumber!,
          Body: payload.body,
        }).toString(),
      },
    );

    if (res.statusCode !== 201) {
      const body = await res.body.text();
      throw new Error(`Twilio error ${res.statusCode}: ${body}`);
    }
    logger.info(
      { phone: payload.recipientPhone?.slice(-4) },
      "SMS sent via Twilio",
    );
  }

  /**
   * Send webhook with retry on failure.
   */
  private async sendWebhook(payload: NotificationPayload): Promise<void> {
    if (!payload.webhookUrl) throw new Error("No webhook URL");

    const res = await request(payload.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: payload.event,
        data: payload.data,
        orderId: payload.orderId,
        transactionId: payload.transactionId,
        timestamp: new Date().toISOString(),
      }),
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });

    if (res.statusCode >= 400) {
      throw new Error(`Webhook returned ${res.statusCode}`);
    }
  }

  /**
   * Start the webhook retry processor.
   * Retries failed webhooks with exponential backoff (5s, 30s, 5m, 30m, 2h).
   */
  startRetryProcessor(): void {
    this.retryInterval = setInterval(async () => {
      const now = Date.now();
      for (const [id, entry] of this.webhookRetryQueue) {
        if (entry.nextRetry > now) continue;
        if (entry.attempts >= 5) {
          logger.error(
            {
              id,
              url: entry.payload.webhookUrl,
              attempts: entry.attempts,
            },
            "Webhook permanently failed after max retries",
          );
          this.webhookRetryQueue.delete(id);
          continue;
        }

        try {
          await this.sendWebhook(entry.payload);
          this.webhookRetryQueue.delete(id);
          logger.info({ id, attempts: entry.attempts }, "Webhook retry succeeded");
        } catch {
          entry.attempts++;
          const delays = [5000, 30000, 300000, 1800000, 7200000];
          entry.nextRetry = now + (delays[entry.attempts - 1] || 7200000);
          logger.warn(
            {
              id,
              attempt: entry.attempts,
              nextRetry: new Date(entry.nextRetry).toISOString(),
            },
            "Webhook retry failed, scheduling next attempt",
          );
        }
      }
    }, 5000);
  }

  /**
   * Stop the retry processor.
   */
  stopRetryProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = undefined;
    }
  }

  /**
   * Build notification from ONDC event data.
   */
  static buildOrderNotification(
    event: NotificationEvent,
    orderData: {
      orderId: string;
      buyerPhone?: string;
      buyerEmail?: string;
      sellerWebhookUrl?: string;
      itemSummary?: string;
      amount?: number;
      trackingUrl?: string;
    },
  ): NotificationPayload {
    const messages: Record<NotificationEvent, string> = {
      [NotificationEvent.ORDER_CONFIRMED]: `Your order ${orderData.orderId} has been confirmed. ${orderData.itemSummary || ""}`,
      [NotificationEvent.ORDER_CANCELLED]: `Your order ${orderData.orderId} has been cancelled. Refund will be processed within 14 days.`,
      [NotificationEvent.ORDER_SHIPPED]: `Your order ${orderData.orderId} has been shipped. ${orderData.trackingUrl ? `Track: ${orderData.trackingUrl}` : ""}`,
      [NotificationEvent.ORDER_DELIVERED]: `Your order ${orderData.orderId} has been delivered. Thank you for shopping!`,
      [NotificationEvent.ORDER_RETURNED]: `Return for order ${orderData.orderId} has been initiated.`,
      [NotificationEvent.PAYMENT_RECEIVED]: `Payment of INR ${((orderData.amount || 0) / 100).toFixed(2)} received for order ${orderData.orderId}.`,
      [NotificationEvent.PAYMENT_FAILED]: `Payment failed for order ${orderData.orderId}. Please try again.`,
      [NotificationEvent.REFUND_INITIATED]: `Refund initiated for order ${orderData.orderId}. Amount will be credited within 5-7 business days.`,
      [NotificationEvent.REFUND_COMPLETED]: `Refund of INR ${((orderData.amount || 0) / 100).toFixed(2)} processed for order ${orderData.orderId}.`,
      [NotificationEvent.ISSUE_RAISED]: `Issue raised for order ${orderData.orderId}. We'll get back to you within 24 hours.`,
      [NotificationEvent.ISSUE_RESOLVED]: `Your issue for order ${orderData.orderId} has been resolved.`,
      [NotificationEvent.ISSUE_ESCALATED]: `Your issue for order ${orderData.orderId} has been escalated for faster resolution.`,
      [NotificationEvent.FULFILLMENT_UPDATE]: `Update for order ${orderData.orderId}: ${orderData.itemSummary || "Status changed."}`,
      [NotificationEvent.NEW_ORDER]: `New order ${orderData.orderId} received! ${orderData.itemSummary || ""}`,
    };

    return {
      event,
      recipientPhone: orderData.buyerPhone,
      recipientEmail: orderData.buyerEmail,
      webhookUrl: orderData.sellerWebhookUrl,
      subject: `Order ${orderData.orderId}: ${event.replace(/_/g, " ").toLowerCase()}`,
      body:
        messages[event] || `Order ${orderData.orderId} status update.`,
      orderId: orderData.orderId,
      data: orderData as unknown as Record<string, unknown>,
    };
  }
}
