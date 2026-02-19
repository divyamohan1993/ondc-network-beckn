import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { buildAuthHeader } from "../crypto/auth-header.js";

export interface SigningMiddlewareConfig {
  subscriberId: string;
  uniqueKeyId: string;
  privateKey: string;
}

/**
 * Create a Fastify preHandler hook that signs the outgoing request body
 * and attaches the Authorization header per the ONDC spec.
 *
 * Usage:
 *   fastify.addHook("preHandler", createSigningMiddleware({
 *     subscriberId: "example.com",
 *     uniqueKeyId: "key-1",
 *     privateKey: "<base64 ed25519 private key>"
 *   }));
 *
 * @param config - subscriberId, uniqueKeyId, and privateKey (base64).
 * @returns Fastify preHandler hook function.
 */
export function createSigningMiddleware(config: SigningMiddlewareConfig) {
  const { subscriberId, uniqueKeyId, privateKey } = config;

  return function signingPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    try {
      const body = request.body;

      if (body && typeof body === "object") {
        const authHeader = buildAuthHeader({
          subscriberId,
          uniqueKeyId,
          privateKey,
          body: body as object,
        });

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
