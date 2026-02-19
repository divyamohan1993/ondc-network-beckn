import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { auditLogs, subscriberDomains, type Database } from "@ondc/shared/db";
import {
  generateChallenge,
  storeChallenge,
  encryptChallenge,
} from "../services/challenge.js";
import {
  upsert,
  updateStatusBySubscriberId,
} from "../services/subscriber.js";

const logger = createLogger("registry:subscribe");

// ---------------------------------------------------------------------------
// Request body type (legacy flat format)
// ---------------------------------------------------------------------------

interface SubscribeBody {
  subscriber_id: string;
  subscriber_url: string;
  type: "BAP" | "BPP" | "BG";
  domain: string;
  city: string;
  signing_public_key: string;
  encr_public_key: string;
  unique_key_id: string;
}

// ---------------------------------------------------------------------------
// ONDC production format types
// ---------------------------------------------------------------------------

interface OndcSubscribeBody {
  context: { operation: { ops_no: number } }; // 1=BAP, 2=BPP, 4=Both
  message: {
    request_id: string;
    timestamp: string;
    entity: {
      gst?: {
        legal_entity_name?: string;
        business_address?: string;
        city_code?: string[];
        gst_no?: string;
      };
      pan?: {
        name_as_per_pan?: string;
        pan_no?: string;
        date_of_incorporation?: string;
      };
      name_of_authorised_signatory?: string;
      email_id?: string;
      mobile_no?: number;
      country: string;
      subscriber_id: string;
      unique_key_id: string;
      callback_url?: string;
      key_pair: {
        signing_public_key: string;
        encryption_public_key: string;
        valid_from: string;
        valid_until: string;
      };
    };
    network_participant: Array<{
      subscriber_url: string;
      domain: string;
      type: string; // "buyerApp" | "sellerApp" | "gateway"
      msn?: boolean;
      city_code?: string[];
    }>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map ONDC ops_no to subscriber type(s). */
function opsNoToTypes(opsNo: number): Array<"BAP" | "BPP"> {
  switch (opsNo) {
    case 1:
      return ["BAP"];
    case 2:
      return ["BPP"];
    case 4:
      return ["BAP", "BPP"];
    default:
      return [];
  }
}

/** Map ONDC network_participant type string to internal type. */
function mapParticipantType(type: string): "BAP" | "BPP" | "BG" | null {
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
// Route plugin
// ---------------------------------------------------------------------------

/**
 * POST /subscribe
 *
 * Handles the ONDC registry subscription flow:
 * 1. Validate required fields
 * 2. Upsert subscriber with status INITIATED
 * 3. Generate a random challenge
 * 4. Encrypt the challenge with the subscriber's encr_public_key
 * 5. Update subscriber status to UNDER_SUBSCRIPTION
 * 6. Store challenge in Redis with 5-minute TTL
 * 7. Log to audit_logs
 * 8. Return encrypted challenge
 */
export async function subscribeRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;
  const redis = fastify.redis as Redis;

  fastify.post<{ Body: SubscribeBody }>("/subscribe", async (request, reply) => {
    const body = request.body;

    // -----------------------------------------------------------------------
    // 1. Validate required fields
    // -----------------------------------------------------------------------
    const requiredFields: (keyof SubscribeBody)[] = [
      "subscriber_id",
      "subscriber_url",
      "type",
      "domain",
      "city",
      "signing_public_key",
      "encr_public_key",
      "unique_key_id",
    ];

    const missingFields = requiredFields.filter(
      (field) => !body[field] || String(body[field]).trim().length === 0,
    );

    if (missingFields.length > 0) {
      logger.warn({ missingFields }, "Subscribe request missing required fields");
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_FIELDS",
          message: `Missing required fields: ${missingFields.join(", ")}`,
        },
      });
    }

    const validTypes = ["BAP", "BPP", "BG"];
    if (!validTypes.includes(body.type)) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "INVALID_TYPE",
          message: `Invalid subscriber type: ${body.type}. Must be one of: ${validTypes.join(", ")}`,
        },
      });
    }

    try {
      // -------------------------------------------------------------------
      // 2. Upsert subscriber with status INITIATED
      // -------------------------------------------------------------------
      const subscriber = await upsert(db, {
        subscriber_id: body.subscriber_id,
        subscriber_url: body.subscriber_url,
        type: body.type,
        domain: body.domain,
        city: body.city,
        signing_public_key: body.signing_public_key,
        encr_public_key: body.encr_public_key,
        unique_key_id: body.unique_key_id,
        status: "INITIATED",
      });

      logger.info(
        { subscriber_id: body.subscriber_id, id: subscriber.id },
        "Subscriber upserted with INITIATED status",
      );

      // -------------------------------------------------------------------
      // 3. Generate a random challenge
      // -------------------------------------------------------------------
      const challenge = generateChallenge();

      // -------------------------------------------------------------------
      // 4. Encrypt the challenge with subscriber's encr_public_key
      // -------------------------------------------------------------------
      const encryptedChallenge = encryptChallenge(challenge, body.encr_public_key);

      // -------------------------------------------------------------------
      // 5. Update subscriber status to UNDER_SUBSCRIPTION
      // -------------------------------------------------------------------
      await updateStatusBySubscriberId(
        db,
        body.subscriber_id,
        "UNDER_SUBSCRIPTION",
      );

      // -------------------------------------------------------------------
      // 6. Store plaintext challenge in Redis (5 min TTL)
      // -------------------------------------------------------------------
      await storeChallenge(body.subscriber_id, challenge, redis);

      // -------------------------------------------------------------------
      // 7. Log to audit_logs
      // -------------------------------------------------------------------
      await db.insert(auditLogs).values({
        actor: body.subscriber_id,
        action: "SUBSCRIBE_INITIATED",
        resource_type: "subscriber",
        resource_id: subscriber.id,
        details: {
          type: body.type,
          domain: body.domain,
          city: body.city,
        },
        ip_address: request.ip,
      });

      logger.info(
        { subscriber_id: body.subscriber_id },
        "Challenge generated and encrypted, awaiting on_subscribe",
      );

      // -------------------------------------------------------------------
      // 8. Return encrypted challenge
      // -------------------------------------------------------------------
      return reply.status(200).send({
        challenge: encryptedChallenge,
      });
    } catch (err) {
      logger.error({ err, subscriber_id: body.subscriber_id }, "Error processing subscribe request");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "SUBSCRIBE_FAILED",
          message: "An internal error occurred while processing the subscription request.",
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /ondc/subscribe  (ONDC production format)
  //
  // Accepts the official ONDC registry subscription format with nested
  // context/message structure. Maps ops_no and participant types to internal
  // BAP/BPP/BG types. For ops_no=4 (both), creates separate entries for
  // BAP and BPP. Stores key validity dates from key_pair.
  // Also inserts into subscriber_domains for multi-domain support.
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OndcSubscribeBody }>("/ondc/subscribe", async (request, reply) => {
    const body = request.body;

    // -----------------------------------------------------------------------
    // 1. Validate ONDC format structure
    // -----------------------------------------------------------------------
    if (!body.context?.operation?.ops_no) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_OPS_NO",
          message: "context.operation.ops_no is required",
        },
      });
    }

    if (!body.message?.entity?.subscriber_id) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_ENTITY",
          message: "message.entity.subscriber_id is required",
        },
      });
    }

    if (!body.message.entity.key_pair?.signing_public_key || !body.message.entity.key_pair?.encryption_public_key) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_KEY_PAIR",
          message: "message.entity.key_pair with signing_public_key and encryption_public_key is required",
        },
      });
    }

    if (!body.message.network_participant || body.message.network_participant.length === 0) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_NETWORK_PARTICIPANT",
          message: "message.network_participant array is required and must not be empty",
        },
      });
    }

    const opsNo = body.context.operation.ops_no;
    const subscriberTypes = opsNoToTypes(opsNo);

    if (subscriberTypes.length === 0) {
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "INVALID_OPS_NO",
          message: `Invalid ops_no: ${opsNo}. Must be 1 (BAP), 2 (BPP), or 4 (both).`,
        },
      });
    }

    const entity = body.message.entity;
    const networkParticipants = body.message.network_participant;
    const keyPair = entity.key_pair;

    try {
      // -------------------------------------------------------------------
      // 2. Extract entity data and create subscriber(s)
      // -------------------------------------------------------------------
      const results: Array<{ subscriber_id: string; type: string; challenge: string }> = [];

      for (const subType of subscriberTypes) {
        // Find matching network_participant entry for this type
        const matchingParticipant = networkParticipants.find((np) => {
          const mappedType = mapParticipantType(np.type);
          return mappedType === subType;
        });

        // Use the first participant's URL as fallback
        const subscriberUrl = matchingParticipant?.subscriber_url
          ?? entity.callback_url
          ?? networkParticipants[0]!.subscriber_url;

        // Use the first participant's domain and city as defaults
        const domain = matchingParticipant?.domain ?? networkParticipants[0]!.domain;
        const city = matchingParticipant?.city_code?.[0] ?? "";

        // -------------------------------------------------------------------
        // 3. Upsert subscriber with INITIATED status
        // -------------------------------------------------------------------
        const subscriber = await upsert(db, {
          subscriber_id: entity.subscriber_id,
          subscriber_url: subscriberUrl,
          type: subType,
          domain,
          city,
          signing_public_key: keyPair.signing_public_key,
          encr_public_key: keyPair.encryption_public_key,
          unique_key_id: entity.unique_key_id,
          status: "INITIATED",
        });

        // -------------------------------------------------------------------
        // 4. Store valid_from / valid_until from key_pair
        // -------------------------------------------------------------------
        if (keyPair.valid_from || keyPair.valid_until) {
          const extra: { valid_from?: Date; valid_until?: Date } = {};
          if (keyPair.valid_from) extra.valid_from = new Date(keyPair.valid_from);
          if (keyPair.valid_until) extra.valid_until = new Date(keyPair.valid_until);

          await updateStatusBySubscriberId(db, entity.subscriber_id, "INITIATED", extra);
        }

        logger.info(
          { subscriber_id: entity.subscriber_id, type: subType, id: subscriber.id },
          "ONDC subscriber upserted with INITIATED status",
        );

        // -------------------------------------------------------------------
        // Insert subscriber_domains entries for multi-domain support
        // -------------------------------------------------------------------
        for (const np of networkParticipants) {
          const mappedType = mapParticipantType(np.type);
          if (mappedType === subType || subscriberTypes.length === 1) {
            const cities = np.city_code ?? [""];
            for (const cityCode of cities) {
              await db
                .insert(subscriberDomains)
                .values({
                  subscriber_id: entity.subscriber_id,
                  domain: np.domain,
                  city: cityCode || null,
                  is_active: true,
                })
                .onConflictDoNothing();
            }
          }
        }

        // -------------------------------------------------------------------
        // 5. Generate challenge and encrypt
        // -------------------------------------------------------------------
        const challenge = generateChallenge();
        const encryptedChallenge = encryptChallenge(challenge, keyPair.encryption_public_key);

        // -------------------------------------------------------------------
        // 6. Update status to UNDER_SUBSCRIPTION
        // -------------------------------------------------------------------
        await updateStatusBySubscriberId(db, entity.subscriber_id, "UNDER_SUBSCRIPTION");

        // -------------------------------------------------------------------
        // 7. Store challenge in Redis (5 min TTL)
        // -------------------------------------------------------------------
        await storeChallenge(entity.subscriber_id, challenge, redis);

        // -------------------------------------------------------------------
        // 8. Audit log
        // -------------------------------------------------------------------
        await db.insert(auditLogs).values({
          actor: entity.subscriber_id,
          action: "ONDC_SUBSCRIBE_INITIATED",
          resource_type: "subscriber",
          resource_id: subscriber.id,
          details: {
            ops_no: opsNo,
            type: subType,
            domain,
            request_id: body.message.request_id,
            entity_country: entity.country,
          },
          ip_address: request.ip,
        });

        results.push({
          subscriber_id: entity.subscriber_id,
          type: subType,
          challenge: encryptedChallenge,
        });
      }

      logger.info(
        { subscriber_id: entity.subscriber_id, types: subscriberTypes },
        "ONDC subscribe processed, challenge(s) generated",
      );

      // -------------------------------------------------------------------
      // 9. Return encrypted challenge(s)
      // -------------------------------------------------------------------
      return reply.status(200).send({
        challenge: results[results.length - 1]!.challenge,
        ...(results.length > 1 ? { participants: results } : {}),
      });
    } catch (err) {
      logger.error({ err, subscriber_id: entity.subscriber_id }, "Error processing ONDC subscribe request");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "SUBSCRIBE_FAILED",
          message: "An internal error occurred while processing the ONDC subscription request.",
        },
      });
    }
  });
}
