import type { FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared/utils";
import type { TokenManager, TokenClaims } from "../services/token-manager.js";

const logger = createLogger("vault:auth");

const VAULT_TOKEN_HEADER = "x-vault-token";

// ---------------------------------------------------------------------------
// Extend FastifyRequest to carry validated token claims
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    vaultClaims?: TokenClaims;
  }
}

// ---------------------------------------------------------------------------
// Auth guard factory
// ---------------------------------------------------------------------------

/**
 * Create an authentication guard hook for vault routes.
 *
 * Authentication is accepted via either:
 *  1. An internal API key in the `x-vault-token` header matching VAULT_API_KEY
 *  2. A valid vault access token in the `x-vault-token` header
 *
 * @param tokenManager - The token manager instance for validating access tokens
 * @returns A Fastify onRequest hook function
 */
export function createVaultAuthGuard(tokenManager: TokenManager) {
  const vaultApiKey = process.env["VAULT_API_KEY"];

  return async function vaultAuthGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.headers[VAULT_TOKEN_HEADER] as string | undefined;

    if (!token) {
      logger.warn({ ip: request.ip }, "Missing vault token");
      reply.status(401).send({
        error: {
          type: "AUTH-ERROR",
          code: "UNAUTHORIZED",
          message: "Missing x-vault-token header",
        },
      });
      return;
    }

    // Check against internal API key first (fast path)
    if (vaultApiKey && token === vaultApiKey) {
      // Internal API key grants full access - no claims needed
      request.vaultClaims = {
        jti: "internal",
        serviceId: "internal",
        scope: ["*"],
        issuedAt: 0,
        expiresAt: Infinity,
      };
      return;
    }

    // If no API key is configured, only accept access tokens
    // (or in dev mode where VAULT_API_KEY is not set, fall through to token validation)

    // Validate as access token
    const claims = await tokenManager.validateToken(token);
    if (!claims) {
      logger.warn({ ip: request.ip }, "Invalid or expired vault token");
      reply.status(403).send({
        error: {
          type: "AUTH-ERROR",
          code: "FORBIDDEN",
          message: "Invalid or expired vault token",
        },
      });
      return;
    }

    request.vaultClaims = claims;
  };
}

/**
 * Check if the current request has a specific scope.
 */
export function hasScope(request: FastifyRequest, requiredScope: string): boolean {
  const claims = request.vaultClaims;
  if (!claims) return false;

  // Wildcard scope grants everything
  if (claims.scope.includes("*")) return true;

  return claims.scope.includes(requiredScope);
}
