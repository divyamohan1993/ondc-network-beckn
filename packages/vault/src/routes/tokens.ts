import type { FastifyInstance } from "fastify";
import { createLogger } from "@ondc/shared/utils";
import { createVaultAuthGuard, hasScope } from "../middleware/auth.js";

const logger = createLogger("vault:tokens");

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface IssueTokenBody {
  serviceId: string;
  scope: string[];
  ttl?: number;
}

interface ValidateTokenBody {
  token: string;
}

interface RevokeTokenBody {
  token: string;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Token management routes.
 *
 * All routes require a valid vault token (internal API key or access token)
 * via the x-vault-token header.
 */
export async function tokensRoutes(fastify: FastifyInstance): Promise<void> {
  const tokenManager = fastify.tokenManager;

  // Apply auth guard to all routes in this plugin
  fastify.addHook("onRequest", createVaultAuthGuard(tokenManager));

  // =========================================================================
  // POST /tokens/issue - Issue a new access token
  // =========================================================================
  fastify.post<{ Body: IssueTokenBody }>(
    "/tokens/issue",
    async (request, reply) => {
      if (!hasScope(request, "tokens:issue") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "tokens:issue"',
          },
        });
      }

      try {
        const { serviceId, scope, ttl } = request.body;

        if (!serviceId || !scope || !Array.isArray(scope) || scope.length === 0) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "MISSING_FIELDS",
              message: "serviceId and scope (non-empty array) are required",
            },
          });
        }

        // Validate TTL if provided
        if (ttl !== undefined) {
          if (typeof ttl !== "number" || ttl <= 0 || ttl > 86400 * 30) {
            return reply.status(400).send({
              error: {
                type: "VALIDATION-ERROR",
                code: "INVALID_TTL",
                message: "ttl must be a positive number up to 2,592,000 seconds (30 days)",
              },
            });
          }
        }

        const rawToken = await tokenManager.issueToken({
          serviceId,
          scope,
          ttl,
        });

        logger.info({ serviceId, scope, ttl }, "Token issued");

        return reply.status(201).send({
          success: true,
          token: rawToken,
          serviceId,
          scope,
          ttl: ttl ?? 3600,
          expiresAt: new Date(
            Date.now() + (ttl ?? 3600) * 1000,
          ).toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error issuing token");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "TOKEN_ISSUE_FAILED",
            message: "Failed to issue token",
          },
        });
      }
    },
  );

  // =========================================================================
  // POST /tokens/validate - Validate a token and return claims
  // =========================================================================
  fastify.post<{ Body: ValidateTokenBody }>(
    "/tokens/validate",
    async (request, reply) => {
      try {
        const { token } = request.body;

        if (!token) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "MISSING_TOKEN",
              message: "token field is required",
            },
          });
        }

        const claims = await tokenManager.validateToken(token);

        if (!claims) {
          return reply.status(200).send({
            valid: false,
            claims: null,
          });
        }

        return reply.status(200).send({
          valid: true,
          claims: {
            jti: claims.jti,
            serviceId: claims.serviceId,
            scope: claims.scope,
            issuedAt: new Date(claims.issuedAt * 1000).toISOString(),
            expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
          },
        });
      } catch (err) {
        logger.error({ err }, "Error validating token");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "TOKEN_VALIDATE_FAILED",
            message: "Failed to validate token",
          },
        });
      }
    },
  );

  // =========================================================================
  // POST /tokens/revoke - Revoke a token
  // =========================================================================
  fastify.post<{ Body: RevokeTokenBody }>(
    "/tokens/revoke",
    async (request, reply) => {
      if (!hasScope(request, "tokens:revoke") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "tokens:revoke"',
          },
        });
      }

      try {
        const { token } = request.body;

        if (!token) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "MISSING_TOKEN",
              message: "token field is required",
            },
          });
        }

        const revoked = await tokenManager.revokeToken(token);

        if (!revoked) {
          return reply.status(200).send({
            success: false,
            message: "Token is already invalid, expired, or revoked",
          });
        }

        logger.info("Token revoked");

        return reply.status(200).send({
          success: true,
          message: "Token revoked successfully",
        });
      } catch (err) {
        logger.error({ err }, "Error revoking token");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "TOKEN_REVOKE_FAILED",
            message: "Failed to revoke token",
          },
        });
      }
    },
  );
}
