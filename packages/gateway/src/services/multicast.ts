import type { ChannelModel, Channel } from "amqplib";
import { request as httpRequest } from "undici";
import { buildGatewayAuthHeader, createLogger, buildTraceHeadersFromContext } from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";

const logger = createLogger("gateway-multicast");

const EXCHANGE_NAME = "gateway.search";
const QUEUE_NAME = "gateway.search.fanout";
const DLQ_NAME = "search.dlq";
const MAX_RETRIES = 3;

/**
 * Message published to the RabbitMQ queue for search fan-out.
 */
export interface SearchFanoutMessage {
  bppUrl: string;
  signedRequest: BecknRequest;
  headers: {
    authorization: string;
    "x-gateway-authorization": string;
  };
  traceContext?: {
    traceId: string;
    spanId: string;
  };
}

/**
 * RabbitMQ-based multicast service that handles fan-out of search requests
 * to multiple BPPs.
 *
 * The gateway publishes one message per matching BPP onto a RabbitMQ queue.
 * A consumer processes these messages asynchronously, making HTTP POST
 * requests to each BPP's /search endpoint.
 */
export class MulticastService {
  private readonly connection: ChannelModel;
  private channel: Channel | null = null;

  // Circuit breaker state per BPP URL
  private circuitBreaker: Map<string, { failures: number; openUntil: number }> = new Map();
  private readonly maxFailures = 5;
  private readonly cooldownMs = 60_000; // 1 minute

  private isCircuitOpen(bppId: string): boolean {
    const state = this.circuitBreaker.get(bppId);
    if (!state) return false;
    if (Date.now() > state.openUntil) {
      this.circuitBreaker.delete(bppId); // Reset after cooldown
      return false;
    }
    return state.failures >= this.maxFailures;
  }

  private recordFailure(bppId: string): void {
    const state = this.circuitBreaker.get(bppId) || { failures: 0, openUntil: 0 };
    state.failures++;
    if (state.failures >= this.maxFailures) {
      state.openUntil = Date.now() + this.cooldownMs;
      logger.warn({ bppId, cooldownMs: this.cooldownMs }, "Circuit breaker OPEN for BPP");
    }
    this.circuitBreaker.set(bppId, state);
  }

  private recordSuccess(bppId: string): void {
    this.circuitBreaker.delete(bppId);
  }

  constructor(rabbitConnection: ChannelModel) {
    this.connection = rabbitConnection;
  }

  /**
   * Initialize the RabbitMQ exchange, queue, and binding.
   *
   * Creates:
   *   - A fanout exchange "gateway.search"
   *   - A durable queue "gateway.search.fanout"
   *   - Binds the queue to the exchange
   */
  async init(): Promise<void> {
    this.channel = await this.connection.createChannel();

    // Assert exchange (fanout type for broadcasting)
    await this.channel.assertExchange(EXCHANGE_NAME, "fanout", {
      durable: true,
    });

    // Assert queue
    await this.channel.assertQueue(QUEUE_NAME, {
      durable: true,
    });

    // Bind queue to exchange
    await this.channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, "");

    // Declare dead letter queue for failed deliveries
    await this.channel.assertQueue(DLQ_NAME, {
      durable: true,
      arguments: {
        "x-message-ttl": 86400000, // 24h retention
      },
    });

    // Prefetch 10 messages at a time for fair dispatch
    await this.channel.prefetch(10);

    logger.info(
      { exchange: EXCHANGE_NAME, queue: QUEUE_NAME, dlq: DLQ_NAME },
      "Multicast service initialized",
    );
  }

  /**
   * Publish a search request for a specific BPP onto the fan-out queue.
   *
   * Steps:
   *   1. Sign the search request body with the gateway's Ed25519 key
   *   2. Build the X-Gateway-Authorization header
   *   3. Publish the message to the exchange
   *
   * @param bppUrl - The BPP's subscriber_url to send the search to.
   * @param request - The original Beckn search request from the BAP.
   * @param authorizationHeader - The original BAP's Authorization header.
   * @param gatewayPrivateKey - Gateway's Ed25519 private key (base64).
   * @param gatewaySubscriberId - Gateway's subscriber_id.
   * @param gatewayKeyId - Gateway's unique_key_id.
   * @param traceContext - Optional trace context for distributed tracing.
   */
  async publishSearch(
    bppUrl: string,
    request: BecknRequest,
    authorizationHeader: string,
    gatewayPrivateKey: string,
    gatewaySubscriberId: string,
    gatewayKeyId: string,
    traceContext?: { traceId: string; spanId: string },
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("MulticastService not initialized. Call init() first.");
    }

    // Sign the request body with gateway's key for X-Gateway-Authorization
    const gatewayAuthHeader = buildGatewayAuthHeader({
      subscriberId: gatewaySubscriberId,
      uniqueKeyId: gatewayKeyId,
      privateKey: gatewayPrivateKey,
      body: request,
    });

    const message: SearchFanoutMessage = {
      bppUrl,
      signedRequest: request,
      headers: {
        authorization: authorizationHeader,
        "x-gateway-authorization": gatewayAuthHeader,
      },
      traceContext,
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));

    this.channel.publish(EXCHANGE_NAME, "", messageBuffer, {
      persistent: true,
      contentType: "application/json",
    });

    logger.debug({ bppUrl, transactionId: request.context.transaction_id }, "Published search to queue");
  }

  /**
   * Start consuming messages from the fan-out queue.
   *
   * For each message:
   *   1. Parse the message payload
   *   2. HTTP POST the signed search request to the BPP's /search endpoint
   *   3. Include both Authorization and X-Gateway-Authorization headers
   *   4. Ack the message regardless of outcome (dead-letter handling is separate)
   *
   * @param onError - Optional error callback for monitoring/alerting.
   */
  async startConsumer(
    onError?: (error: Error, bppUrl: string, transactionId: string) => void,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("MulticastService not initialized. Call init() first.");
    }

    logger.info({ queue: QUEUE_NAME }, "Starting search fan-out consumer");

    await this.channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      let bppUrl = "unknown";
      let transactionId = "unknown";

      try {
        const content = JSON.parse(msg.content.toString()) as SearchFanoutMessage;
        bppUrl = content.bppUrl;
        transactionId = content.signedRequest.context.transaction_id;

        // Ensure bppUrl ends without trailing slash
        const targetUrl = bppUrl.replace(/\/+$/, "") + "/search";

        // Circuit breaker: skip BPPs that have failed too many times
        if (this.isCircuitOpen(bppUrl)) {
          logger.warn(
            { bppUrl, transactionId },
            "Circuit breaker OPEN, skipping BPP",
          );
          this.channel!.ack(msg);
          return;
        }

        logger.info(
          { bppUrl: targetUrl, transactionId },
          "Forwarding search to BPP",
        );

        // Build trace headers for outgoing request to BPP
        const outgoingTraceHeaders = content.traceContext
          ? buildTraceHeadersFromContext(content.traceContext.traceId, content.traceContext.spanId)
          : {};

        const { statusCode } = await httpRequest(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: content.headers.authorization,
            "X-Gateway-Authorization": content.headers["x-gateway-authorization"],
            ...outgoingTraceHeaders,
          },
          body: JSON.stringify(content.signedRequest),
          headersTimeout: 5_000,
          bodyTimeout: 5_000,
        });

        if (statusCode >= 200 && statusCode < 300) {
          this.recordSuccess(bppUrl);
          logger.info(
            { bppUrl: targetUrl, transactionId, statusCode },
            "Search forwarded successfully to BPP",
          );
        } else {
          this.recordFailure(bppUrl);
          logger.warn(
            { bppUrl: targetUrl, transactionId, statusCode },
            "BPP returned non-2xx for search",
          );
        }
      } catch (err) {
        this.recordFailure(bppUrl);
        logger.error(
          { err, bppUrl, transactionId },
          "Error forwarding search to BPP",
        );
        if (onError) {
          onError(err as Error, bppUrl, transactionId);
        }

        // Retry with exponential backoff or move to DLQ
        const retryCount = (msg.properties.headers?.["x-retry-count"] as number) || 0;
        if (retryCount < MAX_RETRIES) {
          this.channel!.publish("", msg.fields.routingKey, msg.content, {
            headers: { ...msg.properties.headers, "x-retry-count": retryCount + 1 },
            expiration: String((retryCount + 1) * 2000), // 2s, 4s, 6s delay
          });
          logger.warn(
            { bppUrl, transactionId, retryCount: retryCount + 1 },
            "Message requeued for retry",
          );
        } else {
          this.channel!.sendToQueue(DLQ_NAME, msg.content, {
            headers: {
              ...msg.properties.headers,
              "x-failed-at": new Date().toISOString(),
              "x-original-routing-key": msg.fields.routingKey,
            },
            persistent: true,
          });
          logger.error(
            { bppUrl, transactionId, retryCount },
            "Message moved to DLQ after max retries",
          );
        }

        this.channel!.ack(msg);
        return;
      }

      // Ack on success
      this.channel!.ack(msg);
    });
  }

  /**
   * Retrieve messages from the dead letter queue for admin monitoring.
   * Messages are fetched without auto-ack so they remain in the queue
   * for inspection. Call with ack=true to remove them after reading.
   *
   * @param limit - Maximum number of messages to retrieve. Defaults to 100.
   * @param autoAck - Whether to ack (remove) messages after reading. Defaults to false.
   * @returns Array of DLQ message payloads with metadata.
   */
  async getDlqMessages(
    limit = 100,
    autoAck = false,
  ): Promise<Array<{ payload: SearchFanoutMessage; headers: Record<string, unknown> }>> {
    if (!this.channel) {
      throw new Error("MulticastService not initialized. Call init() first.");
    }

    const messages: Array<{ payload: SearchFanoutMessage; headers: Record<string, unknown> }> = [];

    for (let i = 0; i < limit; i++) {
      const msg = await this.channel.get(DLQ_NAME, { noAck: false });
      if (!msg) break;

      try {
        const payload = JSON.parse(msg.content.toString()) as SearchFanoutMessage;
        messages.push({
          payload,
          headers: (msg.properties.headers as Record<string, unknown>) ?? {},
        });
      } catch {
        messages.push({
          payload: { bppUrl: "unknown", signedRequest: {} as BecknRequest, headers: { authorization: "", "x-gateway-authorization": "" } },
          headers: { parseError: true, raw: msg.content.toString().slice(0, 200) },
        });
      }

      if (autoAck) {
        this.channel.ack(msg);
      } else {
        this.channel.nack(msg, false, true); // requeue
      }
    }

    return messages;
  }

  /**
   * Close the RabbitMQ channel.
   */
  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
      logger.info("Multicast service channel closed");
    }
  }
}
