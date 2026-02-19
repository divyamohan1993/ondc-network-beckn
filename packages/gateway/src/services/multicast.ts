import type { ChannelModel, Channel } from "amqplib";
import { request as httpRequest } from "undici";
import { buildGatewayAuthHeader, createLogger } from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";

const logger = createLogger("gateway-multicast");

const EXCHANGE_NAME = "gateway.search";
const QUEUE_NAME = "gateway.search.fanout";

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

    // Prefetch 1 message at a time for fair dispatch
    await this.channel.prefetch(10);

    logger.info(
      { exchange: EXCHANGE_NAME, queue: QUEUE_NAME },
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
   */
  async publishSearch(
    bppUrl: string,
    request: BecknRequest,
    authorizationHeader: string,
    gatewayPrivateKey: string,
    gatewaySubscriberId: string,
    gatewayKeyId: string,
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

        logger.info(
          { bppUrl: targetUrl, transactionId },
          "Forwarding search to BPP",
        );

        const { statusCode } = await httpRequest(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: content.headers.authorization,
            "X-Gateway-Authorization": content.headers["x-gateway-authorization"],
          },
          body: JSON.stringify(content.signedRequest),
          headersTimeout: 10_000,
          bodyTimeout: 10_000,
        });

        if (statusCode >= 200 && statusCode < 300) {
          logger.info(
            { bppUrl: targetUrl, transactionId, statusCode },
            "Search forwarded successfully to BPP",
          );
        } else {
          logger.warn(
            { bppUrl: targetUrl, transactionId, statusCode },
            "BPP returned non-2xx for search",
          );
        }
      } catch (err) {
        logger.error(
          { err, bppUrl, transactionId },
          "Error forwarding search to BPP",
        );
        if (onError) {
          onError(err as Error, bppUrl, transactionId);
        }
      } finally {
        // Always ack the message to prevent re-processing
        this.channel!.ack(msg);
      }
    });
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
