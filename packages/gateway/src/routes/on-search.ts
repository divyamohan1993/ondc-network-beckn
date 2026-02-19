import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  parseAuthHeader,
  verifyAuthHeader,
  validateBecknRequest,
  ack,
  nack,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest, RegistrySubscriber } from "@ondc/shared";
import type { RegistryClient } from "@ondc/shared";
import type { Database } from "@ondc/shared";
import { transactions } from "@ondc/shared";
import type { ResponseAggregator } from "../services/response-agg.js";

const logger = createLogger("gateway-on-search");

export interface OnSearchRouteConfig {
  registryClient: RegistryClient;
  responseAggregator: ResponseAggregator;
  db: Database;
  gatewayPrivateKey: string;
  gatewaySubscriberId: string;
  gatewayKeyId: string;
}

/**
 * Register the POST /on_search route on the Fastify instance.
 *
 * This endpoint receives on_search callbacks from BPPs after they have
 * processed a search request. The gateway verifies the BPP's signature,
 * signs the response with the gateway key, and forwards it to the BAP's
 * callback URL.
 *
 * Flow:
 *   1. Receive on_search callback from a BPP
 *   2. Verify BPP's Authorization header
 *   3. Validate Beckn request format
 *   4. Extract context.bap_uri from the message
 *   5. Sign and forward the on_search response to the BAP
 *   6. Log transaction in DB
 *   7. Return ACK to BPP
 */
export function registerOnSearchRoute(
  fastify: FastifyInstance,
  config: OnSearchRouteConfig,
): void {
  const {
    registryClient,
    responseAggregator,
    db,
    gatewayPrivateKey,
    gatewaySubscriberId,
    gatewayKeyId,
  } = config;

  fastify.post("/on_search", async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    // -----------------------------------------------------------------------
    // 1. Extract and verify Authorization header
    // -----------------------------------------------------------------------
    const authHeader = request.headers["authorization"];

    if (!authHeader || typeof authHeader !== "string") {
      logger.warn("Missing Authorization header on /on_search");
      return reply.code(401).send(
        nack("CONTEXT-ERROR", "10001", "Missing Authorization header."),
      );
    }

    // Parse the auth header to extract subscriber info
    const parsed = parseAuthHeader(authHeader);

    if (!parsed.subscriberId) {
      logger.warn("Invalid Authorization header: missing subscriberId");
      return reply.code(401).send(
        nack("CONTEXT-ERROR", "10001", "Invalid Authorization header: unable to extract subscriberId."),
      );
    }

    // Look up the BPP's public key from the registry
    let bppSubscriber: RegistrySubscriber | null;
    try {
      bppSubscriber = await registryClient.lookup(parsed.subscriberId);
    } catch (err) {
      logger.error({ err, subscriberId: parsed.subscriberId }, "Registry lookup failed");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Failed to look up subscriber in registry."),
      );
    }

    if (!bppSubscriber || !bppSubscriber.signing_public_key) {
      logger.warn({ subscriberId: parsed.subscriberId }, "BPP not found in registry");
      return reply.code(401).send(
        nack("CONTEXT-ERROR", "10001", `Subscriber "${parsed.subscriberId}" not found in registry.`),
      );
    }

    // Verify the Ed25519 signature
    const body = request.body as object;
    const isValid = verifyAuthHeader({
      header: authHeader,
      body,
      publicKey: bppSubscriber.signing_public_key,
    });

    if (!isValid) {
      logger.warn({ subscriberId: parsed.subscriberId }, "Authorization signature verification failed");
      return reply.code(401).send(
        nack("CONTEXT-ERROR", "10001", "Authorization signature verification failed."),
      );
    }

    // -----------------------------------------------------------------------
    // 2. Validate Beckn request format
    // -----------------------------------------------------------------------
    const validation = validateBecknRequest(body);
    if (!validation.valid) {
      logger.warn({ errors: validation.errors }, "Invalid Beckn on_search request");
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", `Invalid request: ${validation.errors.join("; ")}`),
      );
    }

    const becknRequest = body as BecknRequest;

    // Verify this is an on_search action
    if (becknRequest.context.action !== "on_search") {
      logger.warn({ action: becknRequest.context.action }, "Non-on_search action sent to /on_search");
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "This endpoint only accepts on_search action."),
      );
    }

    // -----------------------------------------------------------------------
    // 3. Extract BAP URI and forward
    // -----------------------------------------------------------------------
    const bapUri = becknRequest.context.bap_uri;
    const transactionId = becknRequest.context.transaction_id;
    const messageId = becknRequest.context.message_id;

    if (!bapUri) {
      logger.warn({ transactionId }, "Missing bap_uri in on_search context");
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "context.bap_uri is required in on_search."),
      );
    }

    logger.info(
      {
        transactionId,
        messageId,
        bppId: parsed.subscriberId,
        bapUri,
      },
      "Processing on_search callback",
    );

    // -----------------------------------------------------------------------
    // 4. Forward on_search to BAP (async - don't block ACK response)
    // -----------------------------------------------------------------------
    // Fire-and-forget the forwarding to BAP. We ACK the BPP immediately.
    const forwardPromise = responseAggregator
      .forwardToBAP(
        bapUri,
        becknRequest,
        gatewayPrivateKey,
        gatewaySubscriberId,
        gatewayKeyId,
      )
      .then((result) => {
        if (result.success) {
          logger.info(
            { transactionId, bapUri, statusCode: result.statusCode },
            "on_search forwarded to BAP successfully",
          );
        } else {
          logger.warn(
            { transactionId, bapUri, error: result.error },
            "Failed to forward on_search to BAP",
          );
        }
      })
      .catch((err) => {
        logger.error(
          { err, transactionId, bapUri },
          "Unexpected error forwarding on_search to BAP",
        );
      });

    // -----------------------------------------------------------------------
    // 5. Log transaction in DB
    // -----------------------------------------------------------------------
    try {
      await db.insert(transactions).values({
        transaction_id: transactionId,
        message_id: messageId,
        action: "on_search",
        bap_id: becknRequest.context.bap_id,
        bpp_id: becknRequest.context.bpp_id ?? parsed.subscriberId,
        domain: becknRequest.context.domain,
        city: becknRequest.context.city,
        request_body: becknRequest,
        status: "CALLBACK_RECEIVED",
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      // Log but do not fail the request if DB insert fails
      logger.error({ err, transactionId }, "Failed to log on_search transaction");
    }

    // -----------------------------------------------------------------------
    // 6. Return immediate ACK to BPP
    // -----------------------------------------------------------------------
    // Ensure the forward promise is tracked so it doesn't silently fail
    // after the response is sent. Fastify will handle unhandled rejections.
    void forwardPromise;

    return reply.code(200).send(ack());
  });
}
