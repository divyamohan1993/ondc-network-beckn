import { hashBody } from "./blake512.js";
import { sign, verify } from "./ed25519.js";

export interface BuildAuthHeaderParams {
  subscriberId: string;
  uniqueKeyId: string;
  privateKey: string;
  body: object;
}

export interface ParsedAuthHeader {
  keyId: string;
  algorithm: string;
  created: string;
  expires: string;
  headers: string;
  signature: string;
  subscriberId: string;
  uniqueKeyId: string;
}

export interface VerifyAuthHeaderParams {
  header: string;
  body: object;
  publicKey: string;
}

/**
 * Build the signing string per the ONDC authentication spec.
 *
 * Format:
 *   (created): <unix_timestamp>
 *   (expires): <unix_timestamp>
 *   digest: BLAKE-512=<base64_digest>
 */
function buildSigningString(
  created: number,
  expires: number,
  digest: string,
): string {
  return `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
}

/**
 * Build the Authorization header for ONDC API requests.
 *
 * Steps:
 *   1. Hash body with BLAKE-512
 *   2. Build signing string with (created), (expires), digest
 *   3. Sign with Ed25519
 *   4. Return formatted Signature header
 *
 * @param params - subscriberId, uniqueKeyId, privateKey (base64), body (object)
 * @returns Authorization header string matching ONDC spec.
 */
export function buildAuthHeader(params: BuildAuthHeaderParams): string {
  const { subscriberId, uniqueKeyId, privateKey, body } = params;

  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300; // 5 minutes validity

  const digest = hashBody(body);
  const signingString = buildSigningString(created, expires, digest);
  const signature = sign(signingString, privateKey);

  return (
    `Signature keyId="${subscriberId}|${uniqueKeyId}|ed25519",` +
    `algorithm="ed25519",` +
    `created="${created}",` +
    `expires="${expires}",` +
    `headers="(created) (expires) digest",` +
    `signature="${signature}"`
  );
}

/**
 * Build the X-Gateway-Authorization header for ONDC gateway requests.
 * Same format as the standard Authorization header.
 *
 * @param params - subscriberId, uniqueKeyId, privateKey (base64), body (object)
 * @returns X-Gateway-Authorization header string matching ONDC spec.
 */
export function buildGatewayAuthHeader(params: BuildAuthHeaderParams): string {
  // The gateway auth header has the same format as the standard auth header
  return buildAuthHeader(params);
}

/**
 * Parse an ONDC Authorization/Signature header string into its components.
 *
 * Expected format:
 *   Signature keyId="...",algorithm="...",created="...",expires="...",headers="...",signature="..."
 *
 * @param header - The full header string.
 * @returns Parsed components including extracted subscriberId and uniqueKeyId from keyId.
 */
export function parseAuthHeader(header: string): ParsedAuthHeader {
  // Remove "Signature " prefix if present
  const headerBody = header.startsWith("Signature ")
    ? header.slice("Signature ".length)
    : header;

  const params: Record<string, string> = {};

  // Match key="value" pairs, accounting for commas within the value
  const regex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(headerBody)) !== null) {
    params[match[1]] = match[2];
  }

  const keyId = params["keyId"] ?? "";
  const keyIdParts = keyId.split("|");
  const subscriberId = keyIdParts[0] ?? "";
  const uniqueKeyId = keyIdParts[1] ?? "";

  return {
    keyId,
    algorithm: params["algorithm"] ?? "",
    created: params["created"] ?? "",
    expires: params["expires"] ?? "",
    headers: params["headers"] ?? "",
    signature: params["signature"] ?? "",
    subscriberId,
    uniqueKeyId,
  };
}

/**
 * Verify an ONDC Authorization header against the request body and public key.
 *
 * Steps:
 *   1. Parse the header
 *   2. Reconstruct the signing string from body + timestamps
 *   3. Verify Ed25519 signature
 *   4. Check that the header has not expired
 *
 * @param params - header string, body object, publicKey (base64)
 * @returns True if the signature is valid and not expired.
 */
export function verifyAuthHeader(params: VerifyAuthHeaderParams): boolean {
  const { header, body, publicKey } = params;

  try {
    const parsed = parseAuthHeader(header);

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    const expires = parseInt(parsed.expires, 10);
    if (isNaN(expires) || now > expires) {
      return false;
    }

    // Check that created is not in the future (with 30s tolerance)
    const created = parseInt(parsed.created, 10);
    if (isNaN(created) || created > now + 30) {
      return false;
    }

    // Reconstruct signing string
    const digest = hashBody(body);
    const signingString = buildSigningString(created, expires, digest);

    // Verify signature
    return verify(signingString, parsed.signature, publicKey);
  } catch {
    return false;
  }
}
