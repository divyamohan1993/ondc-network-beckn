import type { FastifyRequest, FastifyReply } from "fastify";
import type { Redis } from "ioredis";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("rate-limiter");

export interface RateLimiterConfig {
  redisClient: Redis;
  /** Max requests per window per subscriber. Default: 100 */
  maxRequests?: number;
  /** Time window in seconds. Default: 60 */
  windowSeconds?: number;
  /** Redis key prefix. Default: "ratelimit:" */
  prefix?: string;
}

/**
 * Create a per-subscriber rate limiting middleware using Redis sliding window.
 *
 * Extracts the subscriber_id from the request body's context.bap_id (for
 * incoming requests) or from the Authorization header's keyId.
 *
 * Returns 429 Too Many Requests with Beckn NACK if limit is exceeded.
 */
export function createRateLimiterMiddleware(config: RateLimiterConfig) {
  const {
    redisClient,
    maxRequests = 100,
    windowSeconds = 60,
    prefix = "ratelimit:",
  } = config;

  return async function rateLimiterPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Try to extract subscriber ID from body context or auth header
    let subscriberId: string | undefined;

    const body = request.body as Record<string, unknown> | undefined;
    if (body?.["context"] && typeof body["context"] === "object") {
      const context = body["context"] as Record<string, unknown>;
      subscriberId = context["bap_id"] as string | undefined;
    }

    if (!subscriberId) {
      const authHeader = request.headers["authorization"];
      if (typeof authHeader === "string") {
        const match = /keyId="([^"|]+)/.exec(authHeader);
        if (match) {
          subscriberId = match[1]?.split("|")[0];
        }
      }
    }

    if (!subscriberId) {
      // Can't identify subscriber, fall back to IP-based limiting
      subscriberId = `ip:${request.ip}`;
    }

    const key = `${prefix}${subscriberId}`;

    try {
      const current = await redisClient.incr(key);

      if (current === 1) {
        // First request in window, set expiry
        await redisClient.expire(key, windowSeconds);
      }

      // Set rate limit headers
      const remaining = Math.max(0, maxRequests - current);
      const ttl = await redisClient.ttl(key);

      reply.header("X-RateLimit-Limit", maxRequests);
      reply.header("X-RateLimit-Remaining", remaining);
      reply.header("X-RateLimit-Reset", ttl > 0 ? ttl : windowSeconds);

      if (current > maxRequests) {
        logger.warn(
          { subscriberId, current, maxRequests },
          "Rate limit exceeded",
        );
        reply.code(429).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "POLICY-ERROR",
            code: "30001",
            message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowSeconds}s.`,
          },
        });
        return;
      }
    } catch (err) {
      // If Redis fails, allow the request through (fail open)
      logger.error({ err, subscriberId }, "Rate limiter Redis error, allowing request");
    }
  };
}

// ---------------------------------------------------------------------------
// Per-Subscriber Rate Limiter (Gap 21: subscriber-aware rate limiting)
// ---------------------------------------------------------------------------

export interface SubscriberRateLimiterConfig {
  redisClient: Redis;
  /** Requests per window per subscriber. Default: 100 */
  maxRequests?: number;
  /** Window size in seconds. Default: 60 */
  windowSeconds?: number;
  /** Whether to also apply IP-based limits as fallback. Default: true */
  ipFallback?: boolean;
  /** IP-based max requests. Default: 200 */
  ipMaxRequests?: number;
}

/**
 * Create a per-subscriber rate limiter that extracts the subscriber_id from
 * the Authorization header's keyId field. Falls back to IP-based limiting
 * when the subscriber cannot be identified.
 *
 * Unlike `createRateLimiterMiddleware`, this variant applies different limits
 * for identified subscribers vs anonymous IP-based clients and uses a
 * dedicated key namespace.
 */
export function createSubscriberRateLimiter(config: SubscriberRateLimiterConfig) {
  const {
    redisClient,
    maxRequests = 100,
    windowSeconds = 60,
    ipFallback = true,
    ipMaxRequests = 200,
  } = config;

  return async function subscriberRateLimitPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Extract subscriber_id from Authorization header
    let subscriberId: string | null = null;
    const authHeader = request.headers["authorization"];
    if (authHeader && typeof authHeader === "string") {
      const match = /keyId="([^|"]+)/.exec(authHeader);
      if (match) subscriberId = match[1];
    }

    const rateLimitKey = subscriberId
      ? `rl:sub:${subscriberId}`
      : `rl:ip:${request.ip}`;
    const limit = subscriberId ? maxRequests : (ipFallback ? ipMaxRequests : maxRequests);

    try {
      const current = await redisClient.incr(rateLimitKey);
      if (current === 1) {
        await redisClient.expire(rateLimitKey, windowSeconds);
      }

      // Set rate limit headers
      reply.header("X-RateLimit-Limit", limit);
      reply.header("X-RateLimit-Remaining", Math.max(0, limit - current));

      if (current > limit) {
        logger.warn(
          { subscriberId, ip: request.ip, current, limit },
          "Rate limit exceeded",
        );
        reply.code(429).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "POLICY-ERROR",
            code: "30001",
            message: "Rate limit exceeded. Please try again later.",
          },
        });
        return;
      }
    } catch (err) {
      // Don't block on Redis errors - log and continue
      logger.error({ err }, "Rate limiter Redis error");
    }
  };
}
