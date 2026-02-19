import { blake2b } from "blakejs";

/**
 * Compute a BLAKE-512 (BLAKE2b-512) hash of the given body.
 * If body is an object, it is JSON.stringified first.
 * @param body - String or object to hash.
 * @returns Base64-encoded BLAKE-512 digest.
 */
export function hashBody(body: string | object): string {
  const data = typeof body === "object" ? JSON.stringify(body) : body;
  const hashBytes = blake2b(new TextEncoder().encode(data), undefined, 64);
  return Buffer.from(hashBytes).toString("base64");
}

/**
 * Create a Digest header value using BLAKE-512.
 * @param body - String or object to hash.
 * @returns Digest header string in the format `BLAKE-512=<base64_digest>`.
 */
export function createDigestHeader(body: string | object): string {
  const digest = hashBody(body);
  return `BLAKE-512=${digest}`;
}
