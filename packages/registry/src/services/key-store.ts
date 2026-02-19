import { eq, and } from "drizzle-orm";
import type { Redis } from "ioredis";
import { subscribers, type Database } from "@ondc/shared/db";

const KEY_CACHE_PREFIX = "pubkey:";
const KEY_CACHE_TTL_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Cache key helper
// ---------------------------------------------------------------------------

function cacheKey(subscriberId: string, uniqueKeyId: string): string {
  return `${KEY_CACHE_PREFIX}${subscriberId}:${uniqueKeyId}`;
}

// ---------------------------------------------------------------------------
// Key store operations
// ---------------------------------------------------------------------------

/**
 * Look up a subscriber's signing_public_key from the database.
 *
 * @param db - Drizzle database instance.
 * @param subscriberId - The subscriber_id to look up.
 * @param uniqueKeyId - The unique_key_id to match.
 * @returns The signing_public_key, or null if not found.
 */
export async function getPublicKey(
  db: Database,
  subscriberId: string,
  uniqueKeyId: string,
): Promise<string | null> {
  const results = await db
    .select({ signing_public_key: subscribers.signing_public_key })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.subscriber_id, subscriberId),
        eq(subscribers.unique_key_id, uniqueKeyId),
      ),
    )
    .limit(1);

  return results[0]?.signing_public_key ?? null;
}

/**
 * Store a public key in the Redis cache.
 *
 * @param subscriberId - The subscriber_id.
 * @param uniqueKeyId - The unique_key_id.
 * @param publicKey - The signing_public_key to cache.
 * @param redis - Redis client instance.
 */
export async function cachePublicKey(
  subscriberId: string,
  uniqueKeyId: string,
  publicKey: string,
  redis: Redis,
): Promise<void> {
  const key = cacheKey(subscriberId, uniqueKeyId);
  await redis.set(key, publicKey, "EX", KEY_CACHE_TTL_SECONDS);
}

/**
 * Look up a public key, checking Redis cache first, then falling back to DB.
 * Caches the result in Redis on cache miss.
 *
 * @param subscriberId - The subscriber_id to look up.
 * @param uniqueKeyId - The unique_key_id to match.
 * @param redis - Redis client instance.
 * @param db - Drizzle database instance.
 * @returns The signing_public_key, or null if not found.
 */
export async function lookupKey(
  subscriberId: string,
  uniqueKeyId: string,
  redis: Redis,
  db: Database,
): Promise<string | null> {
  const key = cacheKey(subscriberId, uniqueKeyId);

  // Check cache first
  const cached = await redis.get(key);
  if (cached) {
    return cached;
  }

  // Cache miss - look up from DB
  const publicKey = await getPublicKey(db, subscriberId, uniqueKeyId);

  if (publicKey) {
    // Cache for future lookups
    await redis.set(key, publicKey, "EX", KEY_CACHE_TTL_SECONDS);
  }

  return publicKey;
}

/**
 * Invalidate a cached public key.
 *
 * @param subscriberId - The subscriber_id.
 * @param uniqueKeyId - The unique_key_id.
 * @param redis - Redis client instance.
 */
export async function invalidateKey(
  subscriberId: string,
  uniqueKeyId: string,
  redis: Redis,
): Promise<void> {
  const key = cacheKey(subscriberId, uniqueKeyId);
  await redis.del(key);
}
