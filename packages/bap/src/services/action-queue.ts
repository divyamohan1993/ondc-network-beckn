import amqplib from "amqplib";
import type { ChannelModel, Channel } from "amqplib";
import { request } from "undici";
import { createLogger } from "@ondc/shared";

const logger = createLogger("action-queue");

const QUEUE_NAME = "bap.actions";
const DLQ_NAME = "bap.actions.dlq";
const MAX_RETRIES = 3;

export interface QueuedAction {
  action: string;
  bppUri: string;
  body: unknown;
  authHeader: string;
  traceHeaders?: Record<string, string>;
  attempt: number;
  createdAt: string;
}

export class ActionQueueService {
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private rabbitmqUrl: string) {}

  async init(): Promise<void> {
    this.connection = await amqplib.connect(this.rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    // Main queue with dead-letter routing
    await this.channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        "x-message-ttl": 300_000, // 5 min TTL
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": DLQ_NAME,
      },
    });

    // Dead letter queue for failed messages
    await this.channel.assertQueue(DLQ_NAME, {
      durable: true,
      arguments: { "x-message-ttl": 86_400_000 }, // 24h retention
    });

    await this.channel.prefetch(10);
    logger.info("Action queue initialized");
  }

  /**
   * Enqueue a Beckn action for reliable delivery to BPP.
   */
  async enqueue(action: QueuedAction): Promise<void> {
    if (!this.channel) throw new Error("Action queue not initialized");

    this.channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(action)), {
      persistent: true,
      headers: {
        "x-retry-count": action.attempt,
        "x-action": action.action,
      },
    });

    logger.info({ action: action.action, bppUri: action.bppUri }, "Action enqueued");
  }

  /**
   * Start consuming and delivering queued actions to BPPs.
   */
  async startConsumer(): Promise<void> {
    if (!this.channel) throw new Error("Action queue not initialized");

    await this.channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      const action: QueuedAction = JSON.parse(msg.content.toString());
      const retryCount = (msg.properties.headers?.["x-retry-count"] as number) || 0;

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: action.authHeader,
          ...(action.traceHeaders || {}),
        };

        const res = await request(`${action.bppUri}/${action.action}`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.body),
          headersTimeout: 10_000,
          bodyTimeout: 10_000,
        });

        // Drain the response body to avoid memory leaks
        const responseText = await res.body.text();

        if (res.statusCode >= 200 && res.statusCode < 400) {
          this.channel!.ack(msg);
          logger.info(
            { action: action.action, statusCode: res.statusCode },
            "Action delivered",
          );
        } else {
          throw new Error(`BPP returned ${res.statusCode}: ${responseText.slice(0, 200)}`);
        }
      } catch (err) {
        const errorMsg = (err as Error).message;

        if (retryCount >= MAX_RETRIES) {
          // Move to DLQ after exhausting retries
          this.channel!.sendToQueue(DLQ_NAME, msg.content, {
            persistent: true,
            headers: {
              ...msg.properties.headers,
              "x-failed-at": new Date().toISOString(),
              "x-error": errorMsg,
            },
          });
          this.channel!.ack(msg);
          logger.error(
            { action: action.action, retryCount, error: errorMsg },
            "Action failed permanently, moved to DLQ",
          );
        } else {
          // Requeue with exponential backoff via per-message TTL
          action.attempt = retryCount + 1;
          this.channel!.sendToQueue(
            QUEUE_NAME,
            Buffer.from(JSON.stringify(action)),
            {
              persistent: true,
              headers: {
                "x-retry-count": retryCount + 1,
                "x-action": action.action,
              },
              expiration: String((retryCount + 1) * 2000), // 2s, 4s, 6s backoff
            },
          );
          this.channel!.ack(msg);
          logger.warn(
            { action: action.action, retry: retryCount + 1 },
            "Action delivery failed, requeuing",
          );
        }
      }
    });

    logger.info("Action queue consumer started");
  }

  async close(): Promise<void> {
    try { await this.channel?.close(); } catch { /* already closed */ }
    try { await this.connection?.close(); } catch { /* already closed */ }
    logger.info("Action queue connection closed");
  }
}
