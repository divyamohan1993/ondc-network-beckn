import type { FastifyRequest, FastifyReply } from "fastify";
import type { Redis } from "ioredis";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("duplicate-detector");

export interface DuplicateDetectorConfig {
  redisClient: Redis;
  /** TTL for message_id dedup keys in seconds. Default: 300 (5 min) */
  ttlSeconds?: number;
}

/**
 * Create a Fastify preHandler that detects and rejects duplicate requests
 * based on message_id. Per ONDC spec, each message_id should be unique.
 */
export function createDuplicateDetector(config: DuplicateDetectorConfig) {
  const { redisClient, ttlSeconds = 300 } = config;

  return async function duplicateDetectorPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return;

    const context = body["context"] as Record<string, unknown> | undefined;
    if (!context) return;

    const messageId = context["message_id"] as string | undefined;
    const action = context["action"] as string | undefined;
    if (!messageId) return;

    // Skip dedup for callback actions (on_*) as they reuse the original message_id
    if (action && action.startsWith("on_")) return;

    const dedupKey = `msg:dedup:${messageId}`;

    try {
      const exists = await redisClient.get(dedupKey);
      if (exists) {
        logger.warn({ messageId, action }, "Duplicate message_id detected");
        reply.code(400).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "POLICY-ERROR",
            code: "30013",
            message: `Duplicate request: message_id "${messageId}" has already been processed.`,
          },
        });
        return;
      }

      // Mark this message_id as seen
      await redisClient.set(dedupKey, action ?? "unknown", "EX", ttlSeconds);
    } catch (err) {
      // Don't block on Redis errors
      logger.error({ err, messageId }, "Duplicate detector Redis error");
    }
  };
}
