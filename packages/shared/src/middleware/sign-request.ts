import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { buildAuthHeader, buildHybridAuthHeader } from "../crypto/auth-header.js";
import { isPqEnabled } from "../crypto/post-quantum.js";

export interface SigningMiddlewareConfig {
  subscriberId: string;
  uniqueKeyId: string;
  privateKey: string;
  /** Base64-encoded ML-DSA-65 private key. When set and PQ_CRYPTO_ENABLED=true, uses hybrid mode. */
  pqPrivateKey?: string;
}

/**
 * Create a Fastify preHandler hook that signs the outgoing request body
 * and attaches the Authorization header per the ONDC spec.
 *
 * When PQ_CRYPTO_ENABLED=true and pqPrivateKey is configured, produces
 * hybrid Ed25519+ML-DSA-65 signatures. Otherwise classical Ed25519 only.
 *
 * @param config - subscriberId, uniqueKeyId, privateKey (base64), optional pqPrivateKey.
 * @returns Fastify preHandler hook function.
 */
export function createSigningMiddleware(config: SigningMiddlewareConfig) {
  const { subscriberId, uniqueKeyId, privateKey, pqPrivateKey } = config;

  return function signingPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    try {
      const body = request.body;

      if (body && typeof body === "object") {
        let authHeader: string;

        if (pqPrivateKey && isPqEnabled()) {
          authHeader = buildHybridAuthHeader({
            subscriberId,
            uniqueKeyId,
            privateKey,
            body: body as object,
            pqPrivateKey,
          });
        } else {
          authHeader = buildAuthHeader({
            subscriberId,
            uniqueKeyId,
            privateKey,
            body: body as object,
          });
        }

        // Attach the Authorization header to the request for downstream use.
        // Note: In Fastify, request headers are read-only by default.
        // We store the auth header in a custom property so it can be used
        // when forwarding the request to the next participant.
        (request as FastifyRequest & { ondcAuthHeader?: string }).ondcAuthHeader =
          authHeader;

        // Also set it as a custom header on the raw request for middleware chains
        request.headers["authorization"] = authHeader;
      }

      done();
    } catch (err) {
      done(err as Error);
    }
  };
}
