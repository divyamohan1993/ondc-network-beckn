import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { eq, and, gte, lte, or, isNull, type SQL } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { subscribers, subscriberDomains, type Database } from "@ondc/shared/db";
import { buildAuthHeader, verify } from "@ondc/shared/crypto";

const logger = createLogger("registry:lookup");

const LOOKUP_CACHE_PREFIX = "lookup:";
const LOOKUP_CACHE_TTL_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface LookupBody {
  subscriber_id?: string;
  type?: "BAP" | "BPP" | "BG";
  domain?: string;
  city?: string;
}

/** ONDC v2.0 vlookup format */
interface OndcVlookupBody {
  sender_subscriber_id: string;
  request_id: string;
  timestamp: string;
  signature: string; // sign("country|domain|type|city|subscriber_id")
  search_parameters: {
    country: string;
    domain: string;
    type: string; // "buyerApp" | "sellerApp" | "gateway"
    city: string;
    subscriber_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map ONDC network_participant type string to internal type. */
function mapOndcType(type: string): "BAP" | "BPP" | "BG" | null {
  switch (type) {
    case "buyerApp":
      return "BAP";
    case "sellerApp":
      return "BPP";
    case "gateway":
      return "BG";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public subscriber fields to return
// ---------------------------------------------------------------------------

const PUBLIC_FIELDS = {
  subscriber_id: subscribers.subscriber_id,
  subscriber_url: subscribers.subscriber_url,
  type: subscribers.type,
  domain: subscribers.domain,
  city: subscribers.city,
  signing_public_key: subscribers.signing_public_key,
  encr_public_key: subscribers.encr_public_key,
  unique_key_id: subscribers.unique_key_id,
  status: subscribers.status,
  valid_from: subscribers.valid_from,
  valid_until: subscribers.valid_until,
} as const;

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * POST /lookup
 *
 * Look up registered subscribers in the registry.
 * Supports filtering by subscriber_id, type, domain, and city.
 * Only returns SUBSCRIBED subscribers within their validity period.
 * Results are cached in Redis for 5 minutes.
 */
export async function lookupRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;
  const redis = fastify.redis as Redis;

  fastify.post<{ Body: LookupBody }>("/lookup", async (request, reply) => {
    const body = request.body ?? {};

    try {
      const cacheKey = `${LOOKUP_CACHE_PREFIX}${JSON.stringify({
        s: body.subscriber_id ?? "",
        t: body.type ?? "",
        d: body.domain ?? "",
        c: body.city ?? "",
      })}`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug("Lookup cache hit");
        return reply.status(200).send(JSON.parse(cached));
      }

      // Build dynamic query with filters
      const now = new Date();
      const conditions: SQL[] = [];

      // Only return SUBSCRIBED subscribers
      conditions.push(eq(subscribers.status, "SUBSCRIBED"));

      // Filter out expired subscribers (valid_until must be null or in the future)
      conditions.push(
        or(
          isNull(subscribers.valid_until),
          gte(subscribers.valid_until, now),
        )!,
      );

      // Filter out subscribers whose validity hasn't started yet
      conditions.push(
        or(
          isNull(subscribers.valid_from),
          lte(subscribers.valid_from, now),
        )!,
      );

      if (body.subscriber_id) {
        conditions.push(eq(subscribers.subscriber_id, body.subscriber_id));
      }
      if (body.type) {
        conditions.push(eq(subscribers.type, body.type));
      }

      // Gap 19 fix: Multi-domain lookup support
      // When filtering by domain or city, also check the subscriber_domains table
      // using a LEFT JOIN so subscribers registered in multiple domains are discovered.
      const domainConditions: SQL[] = [];
      if (body.domain) {
        domainConditions.push(
          or(
            eq(subscribers.domain, body.domain),
            eq(subscriberDomains.domain, body.domain),
          )!,
        );
      }
      if (body.city) {
        domainConditions.push(
          or(
            eq(subscribers.city, body.city),
            eq(subscriberDomains.city, body.city),
          )!,
        );
      }

      const whereClause = and(...conditions, ...domainConditions);

      const results = await db
        .selectDistinct(PUBLIC_FIELDS)
        .from(subscribers)
        .leftJoin(
          subscriberDomains,
          and(
            eq(subscribers.subscriber_id, subscriberDomains.subscriber_id),
            eq(subscriberDomains.is_active, true),
          ),
        )
        .where(whereClause)
        .orderBy(subscribers.subscriber_id);

      await redis.set(cacheKey, JSON.stringify(results), "EX", LOOKUP_CACHE_TTL_SECONDS);

      logger.info(
        { filters: body, resultCount: results.length },
        "Lookup completed",
      );

      return reply.status(200).send(results);
    } catch (err) {
      logger.error({ err }, "Error processing lookup request");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "LOOKUP_FAILED",
          message: "An internal error occurred while processing the lookup request.",
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /vlookup  (Verified Lookup - ONDC compliant)
  //
  // Same as /lookup but the response is signed by the registry,
  // proving the lookup results haven't been tampered with.
  // -------------------------------------------------------------------------
  const registryPrivateKey = process.env["REGISTRY_SIGNING_PRIVATE_KEY"] ?? "";
  const registrySubscriberId = process.env["REGISTRY_SUBSCRIBER_ID"] ?? "";
  const registryKeyId = process.env["REGISTRY_UNIQUE_KEY_ID"] ?? "";

  fastify.post<{ Body: LookupBody }>("/vlookup", async (request, reply) => {
    const body = request.body ?? {};

    try {
      const now = new Date();
      const conditions: SQL[] = [];

      conditions.push(eq(subscribers.status, "SUBSCRIBED"));
      conditions.push(
        or(isNull(subscribers.valid_until), gte(subscribers.valid_until, now))!,
      );
      conditions.push(
        or(isNull(subscribers.valid_from), lte(subscribers.valid_from, now))!,
      );

      if (body.subscriber_id) {
        conditions.push(eq(subscribers.subscriber_id, body.subscriber_id));
      }
      if (body.type) {
        conditions.push(eq(subscribers.type, body.type));
      }

      // Gap 19 fix: Multi-domain lookup support for vlookup as well
      const domainConditions: SQL[] = [];
      if (body.domain) {
        domainConditions.push(
          or(
            eq(subscribers.domain, body.domain),
            eq(subscriberDomains.domain, body.domain),
          )!,
        );
      }
      if (body.city) {
        domainConditions.push(
          or(
            eq(subscribers.city, body.city),
            eq(subscriberDomains.city, body.city),
          )!,
        );
      }

      const whereClause = and(...conditions, ...domainConditions);

      const results = await db
        .selectDistinct(PUBLIC_FIELDS)
        .from(subscribers)
        .leftJoin(
          subscriberDomains,
          and(
            eq(subscribers.subscriber_id, subscriberDomains.subscriber_id),
            eq(subscriberDomains.is_active, true),
          ),
        )
        .where(whereClause)
        .orderBy(subscribers.subscriber_id);

      // Build signed response
      const responseBody = {
        subscribers: results,
        timestamp: now.toISOString(),
      };

      // Sign the response with the registry's private key
      let signature: string | undefined;
      if (registryPrivateKey && registrySubscriberId) {
        const authHeader = buildAuthHeader({
          subscriberId: registrySubscriberId,
          uniqueKeyId: registryKeyId,
          privateKey: registryPrivateKey,
          body: responseBody,
        });
        signature = authHeader;
      }

      logger.info(
        { filters: body, resultCount: results.length },
        "Verified lookup completed",
      );

      return reply.status(200).send({
        ...responseBody,
        ...(signature ? { signature } : {}),
      });
    } catch (err) {
      logger.error({ err }, "Error processing vlookup request");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "VLOOKUP_FAILED",
          message: "An internal error occurred while processing the verified lookup request.",
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /ondc/vlookup  (ONDC v2.0 Verified Lookup format)
  //
  // Accepts the ONDC v2.0 vlookup format with sender_subscriber_id,
  // request_id, timestamp, signature, and search_parameters.
  // Verifies the sender's signature and returns matching subscribers.
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OndcVlookupBody }>("/ondc/vlookup", async (request, reply) => {
    const body = request.body;

    // -----------------------------------------------------------------------
    // 1. Validate required fields
    // -----------------------------------------------------------------------
    if (!body.sender_subscriber_id || !body.request_id || !body.timestamp || !body.signature) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_FIELDS",
          message: "sender_subscriber_id, request_id, timestamp, and signature are required",
        },
      });
    }

    if (!body.search_parameters?.country || !body.search_parameters?.domain || !body.search_parameters?.type) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_SEARCH_PARAMS",
          message: "search_parameters must include country, domain, and type",
        },
      });
    }

    const mappedType = mapOndcType(body.search_parameters.type);
    if (!mappedType) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "INVALID_TYPE",
          message: `Invalid type: ${body.search_parameters.type}. Must be buyerApp, sellerApp, or gateway.`,
        },
      });
    }

    try {
      // -------------------------------------------------------------------
      // 2. Verify signature using sender's public key from registry
      // -------------------------------------------------------------------
      const sender = await db
        .select({ signing_public_key: subscribers.signing_public_key })
        .from(subscribers)
        .where(eq(subscribers.subscriber_id, body.sender_subscriber_id))
        .limit(1);

      if (sender.length > 0 && sender[0]!.signing_public_key) {
        // Construct the message that was signed: "country|domain|type|city|subscriber_id"
        const sp = body.search_parameters;
        const signedMessage = [
          sp.country,
          sp.domain,
          sp.type,
          sp.city ?? "",
          sp.subscriber_id ?? "",
        ].join("|");

        const isValid = verify(signedMessage, body.signature, sender[0]!.signing_public_key);
        if (!isValid) {
          logger.warn(
            { sender_subscriber_id: body.sender_subscriber_id },
            "ONDC vlookup signature verification failed",
          );
          return reply.status(401).send({
            error: {
              type: "CONTEXT-ERROR",
              code: "INVALID_SIGNATURE",
              message: "Signature verification failed",
            },
          });
        }
      } else {
        logger.warn(
          { sender_subscriber_id: body.sender_subscriber_id },
          "Sender not found in registry, skipping signature verification",
        );
      }

      // -------------------------------------------------------------------
      // 3. Build query and find matching subscribers
      // -------------------------------------------------------------------
      const now = new Date();
      const conditions: SQL[] = [];

      conditions.push(eq(subscribers.status, "SUBSCRIBED"));
      conditions.push(
        or(isNull(subscribers.valid_until), gte(subscribers.valid_until, now))!,
      );
      conditions.push(
        or(isNull(subscribers.valid_from), lte(subscribers.valid_from, now))!,
      );

      conditions.push(eq(subscribers.type, mappedType));

      // Multi-domain support: check both subscribers and subscriber_domains tables
      const sp = body.search_parameters;
      const domainConditions: SQL[] = [];
      domainConditions.push(
        or(
          eq(subscribers.domain, sp.domain),
          eq(subscriberDomains.domain, sp.domain),
        )!,
      );

      if (sp.city) {
        domainConditions.push(
          or(
            eq(subscribers.city, sp.city),
            eq(subscriberDomains.city, sp.city),
          )!,
        );
      }

      if (sp.subscriber_id) {
        conditions.push(eq(subscribers.subscriber_id, sp.subscriber_id));
      }

      const whereClause = and(...conditions, ...domainConditions);

      const results = await db
        .selectDistinct(PUBLIC_FIELDS)
        .from(subscribers)
        .leftJoin(
          subscriberDomains,
          and(
            eq(subscribers.subscriber_id, subscriberDomains.subscriber_id),
            eq(subscriberDomains.is_active, true),
          ),
        )
        .where(whereClause)
        .orderBy(subscribers.subscriber_id);

      // -------------------------------------------------------------------
      // 4. Build signed response
      // -------------------------------------------------------------------
      const responseBody = {
        subscriber_id: registrySubscriberId,
        request_id: body.request_id,
        timestamp: new Date().toISOString(),
        subscribers: results,
      };

      let signature: string | undefined;
      if (registryPrivateKey && registrySubscriberId) {
        const authHeader = buildAuthHeader({
          subscriberId: registrySubscriberId,
          uniqueKeyId: registryKeyId,
          privateKey: registryPrivateKey,
          body: responseBody,
        });
        signature = authHeader;
      }

      logger.info(
        { sender: body.sender_subscriber_id, resultCount: results.length },
        "ONDC vlookup completed",
      );

      return reply.status(200).send({
        ...responseBody,
        ...(signature ? { signature } : {}),
      });
    } catch (err) {
      logger.error({ err }, "Error processing ONDC vlookup request");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "VLOOKUP_FAILED",
          message: "An internal error occurred while processing the ONDC vlookup request.",
        },
      });
    }
  });
}
