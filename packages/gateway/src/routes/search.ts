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
import type { DiscoveryService } from "../services/discovery.js";
import type { MulticastService } from "../services/multicast.js";

const logger = createLogger("gateway-search");

export interface SearchRouteConfig {
  registryClient: RegistryClient;
  discoveryService: DiscoveryService;
  multicastService: MulticastService;
  db: Database;
  gatewayPrivateKey: string;
  gatewaySubscriberId: string;
  gatewayKeyId: string;
}

/**
 * Register the POST /search route on the Fastify instance.
 *
 * This is the primary entry point for search discovery in the ONDC network.
 * BAPs send search requests to the gateway, which fans them out to all
 * matching BPPs via RabbitMQ.
 *
 * Flow:
 *   1. Receive signed Beckn search request from BAP
 *   2. Verify BAP's Authorization header (signature + registry lookup)
 *   3. Validate Beckn request format
 *   4. Extract context.domain + context.city
 *   5. Discover all SUBSCRIBED BPPs matching domain + city via registry
 *   6. For each matching BPP, publish to RabbitMQ fan-out queue
 *   7. Log transaction in DB
 *   8. Return immediate ACK to BAP
 */
export function registerSearchRoute(
  fastify: FastifyInstance,
  config: SearchRouteConfig,
): void {
  const {
    registryClient,
    discoveryService,
    multicastService,
    db,
    gatewayPrivateKey,
    gatewaySubscriberId,
    gatewayKeyId,
  } = config;

  fastify.post("/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    // -----------------------------------------------------------------------
    // 1. Extract and verify Authorization header
    // -----------------------------------------------------------------------
    const authHeader = request.headers["authorization"];

    if (!authHeader || typeof authHeader !== "string") {
      logger.warn("Missing Authorization header on /search");
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

    // Look up the BAP's public key from the registry
    let bapSubscriber: RegistrySubscriber | null;
    try {
      bapSubscriber = await registryClient.lookup(parsed.subscriberId);
    } catch (err) {
      logger.error({ err, subscriberId: parsed.subscriberId }, "Registry lookup failed");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Failed to look up subscriber in registry."),
      );
    }

    if (!bapSubscriber || !bapSubscriber.signing_public_key) {
      logger.warn({ subscriberId: parsed.subscriberId }, "BAP not found in registry");
      return reply.code(401).send(
        nack("CONTEXT-ERROR", "10001", `Subscriber "${parsed.subscriberId}" not found in registry.`),
      );
    }

    // Verify the Ed25519 signature
    const body = request.body as object;
    const isValid = verifyAuthHeader({
      header: authHeader,
      body,
      publicKey: bapSubscriber.signing_public_key,
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
      logger.warn({ errors: validation.errors }, "Invalid Beckn search request");
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", `Invalid request: ${validation.errors.join("; ")}`),
      );
    }

    const becknRequest = body as BecknRequest;

    // Verify this is a search action
    if (becknRequest.context.action !== "search") {
      logger.warn({ action: becknRequest.context.action }, "Non-search action sent to /search");
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "This endpoint only accepts search action."),
      );
    }

    // -----------------------------------------------------------------------
    // 3. Extract domain and city for BPP discovery
    // -----------------------------------------------------------------------
    const { domain, city } = becknRequest.context;
    const transactionId = becknRequest.context.transaction_id;
    const messageId = becknRequest.context.message_id;

    logger.info(
      { transactionId, messageId, domain, city, bapId: becknRequest.context.bap_id },
      "Processing search request",
    );

    // -----------------------------------------------------------------------
    // 4. Discover matching BPPs
    // -----------------------------------------------------------------------
    const matchingBPPs = await discoveryService.findMatchingBPPs(domain, city);

    if (matchingBPPs.length === 0) {
      logger.info({ transactionId, domain, city }, "No matching BPPs found");
      // Still return ACK even if no BPPs match - the BAP will simply get no on_search callbacks
    }

    // -----------------------------------------------------------------------
    // 5. Publish to RabbitMQ for each matching BPP
    // -----------------------------------------------------------------------
    let publishedCount = 0;
    for (const bpp of matchingBPPs) {
      try {
        await multicastService.publishSearch(
          bpp.subscriber_url,
          becknRequest,
          authHeader,
          gatewayPrivateKey,
          gatewaySubscriberId,
          gatewayKeyId,
        );
        publishedCount++;
      } catch (err) {
        logger.error(
          { err, bppUrl: bpp.subscriber_url, transactionId },
          "Failed to publish search to queue",
        );
      }
    }

    logger.info(
      { transactionId, matchingBPPs: matchingBPPs.length, publishedCount },
      "Search fan-out complete",
    );

    // -----------------------------------------------------------------------
    // 6. Log transaction in DB
    // -----------------------------------------------------------------------
    try {
      await db.insert(transactions).values({
        transaction_id: transactionId,
        message_id: messageId,
        action: "search",
        bap_id: becknRequest.context.bap_id,
        domain,
        city,
        request_body: becknRequest,
        status: "SENT",
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      // Log but do not fail the request if DB insert fails
      logger.error({ err, transactionId }, "Failed to log search transaction");
    }

    // -----------------------------------------------------------------------
    // 7. Return immediate ACK to BAP
    // -----------------------------------------------------------------------
    return reply.code(200).send(ack());
  });
}
