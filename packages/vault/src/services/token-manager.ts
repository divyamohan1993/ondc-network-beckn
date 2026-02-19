import { createHmac, randomUUID, createHash } from "node:crypto";
import type Redis from "ioredis";
import { eq } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { vaultTokens } from "../db/schema.js";
import type { Database } from "../types.js";

const logger = createLogger("vault:token-manager");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenClaims {
  /** Unique token identifier */
  jti: string;
  /** Service that owns this token */
  serviceId: string;
  /** Scopes granted to this token (e.g., ["secrets:read", "secrets:write"]) */
  scope: string[];
  /** Unix timestamp when the token was issued */
  issuedAt: number;
  /** Unix timestamp when the token expires */
  expiresAt: number;
}

export interface IssueTokenOptions {
  serviceId: string;
  scope: string[];
  /** TTL in seconds. Defaults to 3600 (1 hour). */
  ttl?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const REVOCATION_KEY_PREFIX = "vault:revoked:";

// ---------------------------------------------------------------------------
// TokenManager
// ---------------------------------------------------------------------------

/**
 * JWT-like HMAC-SHA256 token manager.
 *
 * Tokens are base64url-encoded JSON payloads with an appended HMAC signature.
 * Revoked tokens are tracked in Redis with automatic TTL expiry.
 */
export class TokenManager {
  private readonly secret: string;
  private readonly redis: Redis;
  private readonly db: Database;

  constructor(secret: string, redis: Redis, db: Database) {
    if (!secret || secret.length < 16) {
      throw new Error(
        "VAULT_TOKEN_SECRET must be at least 16 characters long",
      );
    }
    this.secret = secret;
    this.redis = redis;
    this.db = db;
  }

  /**
   * Issue a new access token for a service.
   *
   * @returns The raw token string that the caller must present in requests.
   */
  async issueToken(options: IssueTokenOptions): Promise<string> {
    const { serviceId, scope, ttl = DEFAULT_TTL_SECONDS } = options;

    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttl;

    const claims: TokenClaims = {
      jti,
      serviceId,
      scope,
      issuedAt: now,
      expiresAt,
    };

    // Build the token: base64url(claims) + "." + hmac-signature
    const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = this.sign(payloadB64);
    const rawToken = `${payloadB64}.${signature}`;

    // Store token hash in database for auditing
    const tokenHash = this.hashToken(rawToken);
    await this.db.insert(vaultTokens).values({
      id: jti,
      service_id: serviceId,
      token_hash: tokenHash,
      scope,
      issued_at: new Date(now * 1000),
      expires_at: new Date(expiresAt * 1000),
    });

    logger.info({ jti, serviceId, scope, ttl }, "Token issued");

    return rawToken;
  }

  /**
   * Validate a token and return its claims.
   *
   * @param rawToken - The raw token string
   * @returns The decoded claims, or null if the token is invalid/expired/revoked
   */
  async validateToken(rawToken: string): Promise<TokenClaims | null> {
    // Split token into payload and signature
    const dotIndex = rawToken.lastIndexOf(".");
    if (dotIndex === -1) {
      logger.warn("Token validation failed: no dot separator");
      return null;
    }

    const payloadB64 = rawToken.substring(0, dotIndex);
    const signature = rawToken.substring(dotIndex + 1);

    // Verify HMAC signature
    const expectedSignature = this.sign(payloadB64);
    if (signature !== expectedSignature) {
      logger.warn("Token validation failed: invalid signature");
      return null;
    }

    // Decode claims
    let claims: TokenClaims;
    try {
      const decoded = Buffer.from(payloadB64, "base64url").toString("utf8");
      claims = JSON.parse(decoded) as TokenClaims;
    } catch {
      logger.warn("Token validation failed: invalid payload");
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.expiresAt <= now) {
      logger.warn({ jti: claims.jti }, "Token validation failed: expired");
      return null;
    }

    // Check revocation list in Redis
    const isRevoked = await this.redis.get(
      `${REVOCATION_KEY_PREFIX}${claims.jti}`,
    );
    if (isRevoked) {
      logger.warn({ jti: claims.jti }, "Token validation failed: revoked");
      return null;
    }

    return claims;
  }

  /**
   * Revoke a token so it can no longer be used.
   *
   * The revocation is stored in Redis with a TTL matching the token's
   * remaining lifetime (so it auto-cleans when the token would have expired).
   */
  async revokeToken(rawToken: string): Promise<boolean> {
    const claims = await this.validateToken(rawToken);
    if (!claims) {
      // Token is already invalid or expired; nothing to revoke
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const remainingTtl = claims.expiresAt - now;

    // Add to Redis revocation list with TTL
    await this.redis.set(
      `${REVOCATION_KEY_PREFIX}${claims.jti}`,
      "1",
      "EX",
      Math.max(remainingTtl, 1),
    );

    // Mark as revoked in database
    await this.db
      .update(vaultTokens)
      .set({ revoked: true })
      .where(eq(vaultTokens.id, claims.jti));

    logger.info(
      { jti: claims.jti, serviceId: claims.serviceId },
      "Token revoked",
    );

    return true;
  }

  /**
   * Create HMAC-SHA256 signature for a payload.
   */
  private sign(payload: string): string {
    return createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
  }

  /**
   * Hash a raw token for storage (we never store the raw token).
   */
  private hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }
}
