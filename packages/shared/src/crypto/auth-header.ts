import { hashBody, hashRawBody } from "./blake512.js";
import { sign, verify } from "./ed25519.js";

export interface BuildAuthHeaderParams {
  subscriberId: string;
  uniqueKeyId: string;
  privateKey: string;
  body: object;
}

export interface BuildHybridAuthHeaderParams extends BuildAuthHeaderParams {
  /** Base64-encoded ML-DSA-65 private key. */
  pqPrivateKey: string;
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

export interface ParsedHybridAuthHeader extends ParsedAuthHeader {
  /** Base64-encoded ML-DSA-65 signature. Empty string when absent. */
  pqSignature: string;
}

export interface VerifyAuthHeaderParams {
  header: string;
  body: object;
  publicKey: string;
  /** Raw body bytes as received on the wire. When provided, used instead of re-serializing body for digest. */
  rawBody?: string;
}

export interface VerifyHybridAuthHeaderParams extends VerifyAuthHeaderParams {
  /** Base64-encoded ML-DSA-65 public key. Required when algorithm is "ed25519+ml-dsa-65". */
  pqPublicKey?: string;
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
export function parseAuthHeader(header: string): ParsedAuthHeader | null {
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
  const algorithm = params["algorithm"] ?? "";

  const keyIdParts = keyId.split("|");
  if (keyIdParts.length !== 3) {
    return null;
  }

  const subscriberId = keyIdParts[0]!;
  const uniqueKeyId = keyIdParts[1]!;
  const keyIdAlgorithm = keyIdParts[2]!;

  if (algorithm && keyIdAlgorithm !== algorithm) {
    return null;
  }

  if (algorithm !== "ed25519") {
    return null;
  }

  return {
    keyId,
    algorithm,
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
  const { header, body, publicKey, rawBody } = params;

  try {
    const parsed = parseAuthHeader(header);
    if (!parsed) {
      return false;
    }

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

    // Use raw body bytes when available to avoid JSON re-serialization differences
    const digest = rawBody !== undefined ? hashRawBody(rawBody) : hashBody(body);
    const signingString = buildSigningString(created, expires, digest);

    // Verify signature
    return verify(signingString, parsed.signature, publicKey);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hybrid (Ed25519 + ML-DSA-65) auth header support
// ---------------------------------------------------------------------------

/**
 * Lazy-load ML-DSA-65 sign/verify. Returns null when unavailable.
 */
let _pqMod: {
  sign(msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
  verify(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array): boolean;
} | null = null;
let _pqModLoaded = false;

async function loadPqSign(): Promise<typeof _pqMod> {
  if (_pqModLoaded) return _pqMod;
  _pqModLoaded = true;
  try {
    const mod = await import("@noble/post-quantum/ml-dsa.js");
    _pqMod = mod.ml_dsa65 as typeof _pqMod;
  } catch {
    _pqMod = null;
  }
  return _pqMod;
}

function requirePqMod() {
  if (!_pqMod) {
    throw new Error("ML-DSA-65 not available. Ensure @noble/post-quantum is installed and ensurePqReady() was called.");
  }
  return _pqMod;
}

/** Pre-load PQ signing module. Call at startup alongside ensurePqReady(). */
export async function initHybridAuth(): Promise<void> {
  await loadPqSign();
}

/**
 * Build a hybrid Authorization header carrying both Ed25519 and ML-DSA-65
 * signatures over the same signing string.
 *
 * Format:
 *   Signature keyId="sub|kid|ed25519+ml-dsa-65",
 *             algorithm="ed25519+ml-dsa-65",
 *             created="...",expires="...",
 *             headers="(created) (expires) digest",
 *             signature="ed25519_sig",
 *             pq_signature="ml-dsa-65_sig"
 *
 * Backward-compatible: verifiers that only understand ed25519 can ignore
 * the pq_signature field and still verify the classical signature.
 */
export function buildHybridAuthHeader(params: BuildHybridAuthHeaderParams): string {
  const { subscriberId, uniqueKeyId, privateKey, body, pqPrivateKey } = params;
  const pq = requirePqMod();

  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;

  const digest = hashBody(body);
  const signingString = buildSigningString(created, expires, digest);

  // Classical Ed25519 signature
  const classicalSig = sign(signingString, privateKey);

  // Post-quantum ML-DSA-65 signature over the same signing string
  const signingBytes = new TextEncoder().encode(signingString);
  const pqSecretKey = Buffer.from(pqPrivateKey, "base64");
  const pqSig = pq.sign(signingBytes, pqSecretKey);
  const pqSigB64 = Buffer.from(pqSig).toString("base64");

  return (
    `Signature keyId="${subscriberId}|${uniqueKeyId}|ed25519+ml-dsa-65",` +
    `algorithm="ed25519+ml-dsa-65",` +
    `created="${created}",` +
    `expires="${expires}",` +
    `headers="(created) (expires) digest",` +
    `signature="${classicalSig}",` +
    `pq_signature="${pqSigB64}"`
  );
}

/**
 * Parse a hybrid auth header. Works for both classical-only and hybrid headers.
 *
 * Returns pqSignature as empty string when the header uses classical-only ed25519.
 */
export function parseHybridAuthHeader(header: string): ParsedHybridAuthHeader | null {
  const headerBody = header.startsWith("Signature ")
    ? header.slice("Signature ".length)
    : header;

  const params: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(headerBody)) !== null) {
    params[match[1]!] = match[2]!;
  }

  const keyId = params["keyId"] ?? "";
  const algorithm = params["algorithm"] ?? "";

  const keyIdParts = keyId.split("|");
  if (keyIdParts.length !== 3) return null;

  const subscriberId = keyIdParts[0]!;
  const uniqueKeyId = keyIdParts[1]!;
  const keyIdAlgorithm = keyIdParts[2]!;

  if (algorithm && keyIdAlgorithm !== algorithm) return null;

  // Accept both "ed25519" and "ed25519+ml-dsa-65"
  if (algorithm !== "ed25519" && algorithm !== "ed25519+ml-dsa-65") return null;

  return {
    keyId,
    algorithm,
    created: params["created"] ?? "",
    expires: params["expires"] ?? "",
    headers: params["headers"] ?? "",
    signature: params["signature"] ?? "",
    pqSignature: params["pq_signature"] ?? "",
    subscriberId,
    uniqueKeyId,
  };
}

/**
 * Verify a hybrid auth header.
 *
 * When algorithm is "ed25519+ml-dsa-65", both the classical and PQ signatures
 * are verified. Both must be valid. When algorithm is "ed25519", only the
 * classical signature is checked (backward compatible).
 *
 * Always evaluates both checks to avoid timing leaks.
 */
export function verifyHybridAuthHeader(params: VerifyHybridAuthHeaderParams): boolean {
  const { header, body, publicKey, rawBody, pqPublicKey } = params;

  try {
    const parsed = parseHybridAuthHeader(header);
    if (!parsed) return false;

    // Timestamp checks
    const now = Math.floor(Date.now() / 1000);
    const expires = parseInt(parsed.expires, 10);
    if (isNaN(expires) || now > expires) return false;

    const created = parseInt(parsed.created, 10);
    if (isNaN(created) || created > now + 30) return false;

    const digest = rawBody !== undefined ? hashRawBody(rawBody) : hashBody(body);
    const signingString = buildSigningString(created, expires, digest);

    // Classical Ed25519 verification
    let classicalValid = false;
    try {
      classicalValid = verify(signingString, parsed.signature, publicKey);
    } catch {
      classicalValid = false;
    }

    // When classical-only, just return classical result
    if (parsed.algorithm === "ed25519") {
      return classicalValid;
    }

    // Hybrid mode: verify PQ signature too
    if (!pqPublicKey || !parsed.pqSignature) return false;

    let pqValid = false;
    try {
      const pq = requirePqMod();
      const signingBytes = new TextEncoder().encode(signingString);
      const pqPubKey = Buffer.from(pqPublicKey, "base64");
      const pqSig = Buffer.from(parsed.pqSignature, "base64");
      pqValid = pq.verify(pqSig, signingBytes, pqPubKey);
    } catch {
      pqValid = false;
    }

    return classicalValid && pqValid;
  } catch {
    return false;
  }
}
