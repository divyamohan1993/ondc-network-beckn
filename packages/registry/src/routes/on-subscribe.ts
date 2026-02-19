import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { createLogger } from "@ondc/shared/utils";
import { ack, nack } from "@ondc/shared/protocol";
import { decrypt } from "@ondc/shared/crypto";
import { auditLogs, type Database } from "@ondc/shared/db";
import { verifyChallenge } from "../services/challenge.js";
import {
  findBySubscriberId,
  updateStatusBySubscriberId,
} from "../services/subscriber.js";

const logger = createLogger("registry:on_subscribe");

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface OnSubscribeBody {
  subscriber_id: string;
  answer: string;
}

/** ONDC production format: registry calls YOUR /on_subscribe with encrypted challenge */
interface OndcOnSubscribeBody {
  subscriber_id: string;
  challenge: string;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * POST /on_subscribe
 *
 * Completes the ONDC registry subscription handshake:
 * 1. Validate required fields
 * 2. Look up subscriber, verify status is UNDER_SUBSCRIPTION
 * 3. Verify the answer against the stored challenge in Redis
 * 4. If match: update status to SUBSCRIBED, set valid_from/valid_until
 * 5. Log to audit_logs
 * 6. Return ACK or NACK
 */
export async function onSubscribeRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;
  const redis = fastify.redis as Redis;

  fastify.post<{ Body: OnSubscribeBody }>("/on_subscribe", async (request, reply) => {
    const body = request.body;

    // -----------------------------------------------------------------------
    // 1. Validate required fields
    // -----------------------------------------------------------------------
    if (!body.subscriber_id || !body.answer) {
      logger.warn("on_subscribe missing subscriber_id or answer");
      return reply.status(400).send(
        nack("CONTEXT-ERROR", "MISSING_FIELDS", "subscriber_id and answer are required"),
      );
    }

    try {
      // -------------------------------------------------------------------
      // 2. Look up subscriber and verify status
      // -------------------------------------------------------------------
      const subscriber = await findBySubscriberId(db, body.subscriber_id);

      if (!subscriber) {
        logger.warn(
          { subscriber_id: body.subscriber_id },
          "Subscriber not found for on_subscribe",
        );
        return reply.status(404).send(
          nack("CONTEXT-ERROR", "SUBSCRIBER_NOT_FOUND", "Subscriber not found"),
        );
      }

      if (subscriber.status !== "UNDER_SUBSCRIPTION") {
        logger.warn(
          { subscriber_id: body.subscriber_id, status: subscriber.status },
          "Subscriber not in UNDER_SUBSCRIPTION state",
        );
        return reply.status(400).send(
          nack(
            "CONTEXT-ERROR",
            "INVALID_STATE",
            `Subscriber is in ${subscriber.status ?? "unknown"} state, expected UNDER_SUBSCRIPTION`,
          ),
        );
      }

      // -------------------------------------------------------------------
      // 3. Verify the answer against stored challenge
      // -------------------------------------------------------------------
      const isValid = await verifyChallenge(body.subscriber_id, body.answer, redis);

      if (!isValid) {
        logger.warn(
          { subscriber_id: body.subscriber_id },
          "Challenge verification failed",
        );

        // Log the failed attempt
        await db.insert(auditLogs).values({
          actor: body.subscriber_id,
          action: "SUBSCRIBE_CHALLENGE_FAILED",
          resource_type: "subscriber",
          resource_id: subscriber.id,
          details: { reason: "Challenge answer did not match or expired" },
          ip_address: request.ip,
        });

        return reply.status(401).send(
          nack(
            "CONTEXT-ERROR",
            "CHALLENGE_FAILED",
            "Challenge verification failed. The answer does not match or the challenge has expired.",
          ),
        );
      }

      // -------------------------------------------------------------------
      // 4. Update status to SUBSCRIBED with validity period
      // -------------------------------------------------------------------
      const validFrom = new Date();
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1); // Valid for 1 year

      await updateStatusBySubscriberId(db, body.subscriber_id, "SUBSCRIBED", {
        valid_from: validFrom,
        valid_until: validUntil,
      });

      logger.info(
        { subscriber_id: body.subscriber_id, valid_from: validFrom, valid_until: validUntil },
        "Subscriber successfully subscribed",
      );

      // -------------------------------------------------------------------
      // 5. Log to audit_logs
      // -------------------------------------------------------------------
      await db.insert(auditLogs).values({
        actor: body.subscriber_id,
        action: "SUBSCRIBE_COMPLETED",
        resource_type: "subscriber",
        resource_id: subscriber.id,
        details: {
          valid_from: validFrom.toISOString(),
          valid_until: validUntil.toISOString(),
        },
        ip_address: request.ip,
      });

      // -------------------------------------------------------------------
      // 6. Return ACK
      // -------------------------------------------------------------------
      return reply.status(200).send(ack());
    } catch (err) {
      logger.error({ err, subscriber_id: body.subscriber_id }, "Error processing on_subscribe");
      return reply.status(500).send(
        nack("INTERNAL-ERROR", "ON_SUBSCRIBE_FAILED", "An internal error occurred"),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /ondc/on_subscribe  (ONDC production format)
  //
  // In the ONDC production flow, the ONDC registry calls YOUR /on_subscribe
  // endpoint with an encrypted challenge string. Your service must decrypt it
  // using the subscriber's X25519 private key and return the plaintext.
  //
  // Request:  { "subscriber_id": "example.com", "challenge": "encrypted_string" }
  // Response: { "answer": "decrypted_challenge_string" }
  // -------------------------------------------------------------------------
  const subscriberEncryptionPrivateKey = process.env["REGISTRY_ENCRYPTION_PRIVATE_KEY"] ?? "";
  const ondcPublicKey = process.env["ONDC_ENCRYPTION_PUBLIC_KEY"] ?? "";

  fastify.post<{ Body: OndcOnSubscribeBody }>("/ondc/on_subscribe", async (request, reply) => {
    const body = request.body;

    // -----------------------------------------------------------------------
    // 1. Validate required fields
    // -----------------------------------------------------------------------
    if (!body.subscriber_id || !body.challenge) {
      logger.warn("ONDC on_subscribe missing subscriber_id or challenge");
      return reply.status(400).send({
        error: {
          type: "CONTEXT-ERROR",
          code: "MISSING_FIELDS",
          message: "subscriber_id and challenge are required",
        },
      });
    }

    try {
      // -------------------------------------------------------------------
      // 2. Decrypt the challenge using our X25519 private key
      // -------------------------------------------------------------------
      if (!subscriberEncryptionPrivateKey) {
        logger.error("REGISTRY_ENCRYPTION_PRIVATE_KEY not configured");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "MISSING_KEY",
            message: "Encryption private key not configured",
          },
        });
      }

      const decryptedChallenge = decrypt(
        body.challenge,
        subscriberEncryptionPrivateKey,
        ondcPublicKey,
      );

      logger.info(
        { subscriber_id: body.subscriber_id },
        "ONDC on_subscribe challenge decrypted successfully",
      );

      // -------------------------------------------------------------------
      // 3. Log the on_subscribe event
      // -------------------------------------------------------------------
      await db.insert(auditLogs).values({
        actor: body.subscriber_id,
        action: "ONDC_ON_SUBSCRIBE_ANSWERED",
        resource_type: "subscriber",
        resource_id: body.subscriber_id,
        details: { source: "ondc_production_format" },
        ip_address: request.ip,
      });

      // -------------------------------------------------------------------
      // 4. Return the decrypted challenge as the answer
      // -------------------------------------------------------------------
      return reply.status(200).send({
        answer: decryptedChallenge,
      });
    } catch (err) {
      logger.error({ err, subscriber_id: body.subscriber_id }, "Error processing ONDC on_subscribe");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "ON_SUBSCRIBE_FAILED",
          message: "Failed to decrypt challenge. Ensure encryption keys are configured correctly.",
        },
      });
    }
  });
}
