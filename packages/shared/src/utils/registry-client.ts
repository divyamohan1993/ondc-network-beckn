import { request as httpRequest } from "undici";
import type { Redis } from "ioredis";
import { createLogger } from "./logger.js";

const logger = createLogger("registry-client");

/** TTL for cached registry entries (in seconds). */
const CACHE_TTL_SECONDS = 300; // 5 minutes

/** Prefix for Redis cache keys. */
const CACHE_PREFIX = "ondc:registry:";

/**
 * Subscriber record returned from the ONDC registry /lookup endpoint.
 */
export interface RegistrySubscriber {
  subscriber_id: string;
  subscriber_url?: string;
  type?: string;
  domain?: string;
  city?: string;
  country?: string;
  signing_public_key: string;
  encr_public_key?: string;
  /** ML-DSA-65 public key for hybrid post-quantum signing (FIPS 204). */
  pq_signing_public_key?: string;
  /** ML-KEM-768 public key for hybrid post-quantum encryption (FIPS 203). */
  pq_encryption_public_key?: string;
  unique_key_id?: string;
  valid_from?: string;
  valid_until?: string;
  status?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

/**
 * Parameters for the /subscribe endpoint.
 */
export interface SubscribeParams {
  subscriber_id: string;
  subscriber_url: string;
  type: string;
  domain: string;
  city: string;
  country: string;
  signing_public_key: string;
  encr_public_key: string;
  [key: string]: unknown;
}

/**
 * HTTP client for the ONDC registry, providing /lookup and /subscribe calls
 * with optional Redis caching.
 */
export class RegistryClient {
  private readonly registryUrl: string;
  private readonly redis: Redis | undefined;

  /** In-memory store of pinned public keys for tamper detection. */
  private pinnedKeys: Map<string, string> = new Map();

  /**
   * @param registryUrl - Base URL of the ONDC registry (e.g. "https://registry.ondc.org").
   * @param redisClient - Optional ioredis client for caching lookup results.
   */
  constructor(registryUrl: string, redisClient?: Redis) {
    this.registryUrl = registryUrl.replace(/\/+$/, ""); // strip trailing slash
    this.redis = redisClient;
  }

  /**
   * Look up a subscriber by subscriber_id.
   *
   * Caches the result in Redis for 5 minutes if a Redis client is provided.
   *
   * @param subscriberId - The subscriber_id to look up.
   * @returns The subscriber record, or null if not found.
   */
  async lookup(subscriberId: string, uniqueKeyId?: string, traceHeaders?: Record<string, string>): Promise<RegistrySubscriber | null> {
    const cacheKey = `${CACHE_PREFIX}lookup:${subscriberId}${uniqueKeyId ? `:${uniqueKeyId}` : ""}`;

    // Try cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          logger.debug({ subscriberId }, "Registry lookup cache hit");
          return JSON.parse(cached) as RegistrySubscriber;
        }
      } catch (err) {
        logger.warn({ err, subscriberId }, "Redis cache read error, falling back to registry");
      }
    }

    // Call registry
    try {
      const { statusCode, body } = await httpRequest(
        `${this.registryUrl}/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...traceHeaders },
          body: JSON.stringify({
            subscriber_id: subscriberId,
            ...(uniqueKeyId ? { unique_key_id: uniqueKeyId } : {}),
          }),
        },
      );

      if (statusCode !== 200) {
        logger.warn(
          { subscriberId, statusCode },
          "Registry /lookup returned non-200 status",
        );
        return null;
      }

      const responseText = await body.text();
      const data = JSON.parse(responseText);

      // The registry returns an array of subscribers
      const allSubscribers: RegistrySubscriber[] = Array.isArray(data) ? data : [];
      const subscriber = uniqueKeyId
        ? allSubscribers.find((s) => s.unique_key_id === uniqueKeyId) ?? null
        : allSubscribers[0] ?? null;

      // Key pinning: detect unexpected key changes (possible registry compromise)
      if (subscriber) {
        const pinKey = `${subscriberId}:${uniqueKeyId || "default"}`;
        const pinned = this.pinnedKeys.get(pinKey);
        if (pinned && pinned !== subscriber.signing_public_key) {
          logger.error(
            {
              subscriberId,
              uniqueKeyId,
              pinnedKey: pinned,
              registryKey: subscriber.signing_public_key,
            },
            "KEY PIN VIOLATION: Registry returned different key than pinned. Possible registry compromise.",
          );
        }
        this.pinnedKeys.set(pinKey, subscriber.signing_public_key);
      }

      // Cache the result
      if (subscriber && this.redis) {
        try {
          await this.redis.setex(
            cacheKey,
            CACHE_TTL_SECONDS,
            JSON.stringify(subscriber),
          );
        } catch (err) {
          logger.warn({ err, subscriberId }, "Redis cache write error");
        }
      }

      return subscriber;
    } catch (err) {
      logger.error({ err, subscriberId }, "Registry /lookup request failed");
      return null;
    }
  }

  /**
   * Look up subscribers by domain, city, and optionally type.
   *
   * @param domain - The domain to search (e.g. "nic2004:52110").
   * @param city - The city code (e.g. "std:080").
   * @param type - Optional subscriber type filter ("BAP", "BPP", "BG").
   * @returns Array of matching subscriber records.
   */
  async lookupByDomainCity(
    domain: string,
    city: string,
    type?: string,
    traceHeaders?: Record<string, string>,
  ): Promise<RegistrySubscriber[]> {
    const cacheKey = `${CACHE_PREFIX}domain:${domain}:${city}:${type ?? "all"}`;

    // Try cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          logger.debug({ domain, city, type }, "Registry domain lookup cache hit");
          return JSON.parse(cached) as RegistrySubscriber[];
        }
      } catch (err) {
        logger.warn({ err, domain, city }, "Redis cache read error, falling back to registry");
      }
    }

    try {
      const requestBody: Record<string, string> = { domain, city };
      if (type) {
        requestBody["type"] = type;
      }

      const { statusCode, body } = await httpRequest(
        `${this.registryUrl}/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...traceHeaders },
          body: JSON.stringify(requestBody),
        },
      );

      if (statusCode !== 200) {
        logger.warn(
          { domain, city, type, statusCode },
          "Registry /lookup returned non-200 status",
        );
        return [];
      }

      const responseText = await body.text();
      const data = JSON.parse(responseText);
      const subscribers: RegistrySubscriber[] = Array.isArray(data) ? data : [];

      // Cache the result
      if (subscribers.length > 0 && this.redis) {
        try {
          await this.redis.setex(
            cacheKey,
            CACHE_TTL_SECONDS,
            JSON.stringify(subscribers),
          );
        } catch (err) {
          logger.warn({ err, domain, city }, "Redis cache write error");
        }
      }

      return subscribers;
    } catch (err) {
      logger.error({ err, domain, city }, "Registry /lookup by domain/city failed");
      return [];
    }
  }

  /**
   * Subscribe to the ONDC network by calling the registry /subscribe endpoint.
   *
   * @param params - Subscription parameters including subscriber_id, signing keys, etc.
   * @returns The response body from the registry, or null on failure.
   */
  async subscribe(params: SubscribeParams, traceHeaders?: Record<string, string>): Promise<unknown> {
    try {
      const { statusCode, body } = await httpRequest(
        `${this.registryUrl}/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...traceHeaders },
          body: JSON.stringify(params),
        },
      );

      const responseText = await body.text();

      if (statusCode !== 200) {
        logger.warn(
          { statusCode, response: responseText },
          "Registry /subscribe returned non-200 status",
        );
        return null;
      }

      return JSON.parse(responseText);
    } catch (err) {
      logger.error({ err }, "Registry /subscribe request failed");
      return null;
    }
  }
}
