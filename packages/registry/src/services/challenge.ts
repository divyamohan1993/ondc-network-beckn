import { randomBytes } from "node:crypto";
import type Redis from "ioredis";
import { encrypt } from "@ondc/shared/crypto";

const CHALLENGE_PREFIX = "challenge:";
const CHALLENGE_TTL_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Challenge generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random challenge string.
 * @returns Base64-encoded 32-byte random string.
 */
export function generateChallenge(): string {
  return randomBytes(32).toString("base64");
}

// ---------------------------------------------------------------------------
// Redis-backed challenge storage
// ---------------------------------------------------------------------------

/**
 * Store a challenge in Redis with a 5-minute TTL.
 * Key format: `challenge:{subscriber_id}`
 */
export async function storeChallenge(
  subscriberId: string,
  challenge: string,
  redis: Redis,
): Promise<void> {
  const key = `${CHALLENGE_PREFIX}${subscriberId}`;
  await redis.set(key, challenge, "EX", CHALLENGE_TTL_SECONDS);
}

/**
 * Retrieve the stored challenge for a subscriber from Redis.
 * Returns null if not found or expired.
 */
export async function getChallenge(
  subscriberId: string,
  redis: Redis,
): Promise<string | null> {
  const key = `${CHALLENGE_PREFIX}${subscriberId}`;
  return redis.get(key);
}

/**
 * Verify a subscriber's answer against the stored challenge.
 * Returns true if the answer matches, false otherwise.
 * Deletes the challenge after verification (one-time use).
 */
export async function verifyChallenge(
  subscriberId: string,
  answer: string,
  redis: Redis,
): Promise<boolean> {
  const key = `${CHALLENGE_PREFIX}${subscriberId}`;
  const storedChallenge = await redis.get(key);

  if (!storedChallenge) {
    return false;
  }

  const isMatch = storedChallenge === answer;

  // Delete the challenge regardless of match (one-time use)
  await redis.del(key);

  return isMatch;
}

// ---------------------------------------------------------------------------
// Challenge encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a challenge using the subscriber's X25519 encryption public key.
 * Uses the shared crypto module's encrypt (X25519 ECDH + AES-256-GCM).
 *
 * @param challenge - The plaintext challenge string.
 * @param encrPublicKey - Base64-encoded X25519 public key of the subscriber.
 * @returns Base64-encoded encrypted challenge.
 */
export function encryptChallenge(
  challenge: string,
  encrPublicKey: string,
): string {
  return encrypt(challenge, encrPublicKey);
}
