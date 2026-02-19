import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import type { Redis } from "ioredis";
import { parseAuthHeader, verifyAuthHeader } from "../crypto/auth-header.js";
import { RegistryClient } from "../utils/registry-client.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("verify-auth");

export interface VerifyAuthMiddlewareConfig {
  registryUrl: string;
  redisClient?: Redis;
}

/**
 * Create a Fastify preHandler hook that verifies the Authorization header
 * on incoming Beckn protocol requests.
 *
 * Also checks subscriber validity period (valid_from / valid_until).
 *
 * @param config - registryUrl and optional redisClient for caching.
 * @returns Fastify preHandler hook function.
 */
export function createVerifyAuthMiddleware(config: VerifyAuthMiddlewareConfig) {
  const registryClient = new RegistryClient(config.registryUrl, config.redisClient);

  return async function verifyAuthPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers["authorization"];

    if (!authHeader || typeof authHeader !== "string") {
      logger.warn("Missing Authorization header");
      reply.code(401).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "CONTEXT-ERROR",
          code: "10001",
          message: "Missing Authorization header.",
        },
      });
      return;
    }

    try {
      const parsed = parseAuthHeader(authHeader);

      if (!parsed.subscriberId) {
        logger.warn("Invalid Authorization header: missing subscriberId in keyId");
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: "Invalid Authorization header: unable to extract subscriberId.",
          },
        });
        return;
      }

      const subscriber = await registryClient.lookup(parsed.subscriberId);

      if (!subscriber || !subscriber.signing_public_key) {
        logger.warn(
          { subscriberId: parsed.subscriberId },
          "Subscriber not found or missing signing public key",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: `Subscriber "${parsed.subscriberId}" not found in registry or missing public key.`,
          },
        });
        return;
      }

      // Check subscriber validity period (Gap 9 fix)
      const now = new Date();
      if (subscriber.valid_from && new Date(subscriber.valid_from) > now) {
        logger.warn(
          { subscriberId: parsed.subscriberId, valid_from: subscriber.valid_from },
          "Subscriber validity period has not started",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: `Subscriber "${parsed.subscriberId}" validity period has not started.`,
          },
        });
        return;
      }
      if (subscriber.valid_until && new Date(subscriber.valid_until) < now) {
        logger.warn(
          { subscriberId: parsed.subscriberId, valid_until: subscriber.valid_until },
          "Subscriber validity period has expired",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: `Subscriber "${parsed.subscriberId}" validity period has expired.`,
          },
        });
        return;
      }

      // Verify the signature
      const body = request.body;
      if (!body || typeof body !== "object") {
        logger.warn("Request body is missing or not an object");
        reply.code(400).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10000",
            message: "Request body is required for signature verification.",
          },
        });
        return;
      }

      const isValid = verifyAuthHeader({
        header: authHeader,
        body: body as object,
        publicKey: subscriber.signing_public_key,
      });

      if (!isValid) {
        logger.warn(
          { subscriberId: parsed.subscriberId },
          "Authorization signature verification failed",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: "Authorization signature verification failed.",
          },
        });
        return;
      }

      logger.debug(
        { subscriberId: parsed.subscriberId },
        "Authorization verified successfully",
      );
    } catch (err) {
      logger.error({ err }, "Error verifying authorization header");
      reply.code(500).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "INTERNAL-ERROR",
          code: "20000",
          message: "Internal error during authorization verification.",
        },
      });
    }
  };
}

/**
 * Create a Fastify preHandler hook that verifies the X-Gateway-Authorization
 * header on incoming search requests forwarded by the ONDC gateway.
 *
 * Per ONDC spec, BPPs must verify both:
 *   - Authorization header (from the BAP)
 *   - X-Gateway-Authorization header (from the Gateway)
 *
 * @param config - registryUrl and optional redisClient for caching.
 * @returns Fastify preHandler hook function.
 */
export function createVerifyGatewayAuthMiddleware(config: VerifyAuthMiddlewareConfig) {
  const registryClient = new RegistryClient(config.registryUrl, config.redisClient);

  return async function verifyGatewayAuthPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const gatewayAuthHeader = request.headers["x-gateway-authorization"] as string | undefined;

    if (!gatewayAuthHeader || typeof gatewayAuthHeader !== "string") {
      logger.warn("Missing X-Gateway-Authorization header");
      reply.code(401).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "CONTEXT-ERROR",
          code: "10001",
          message: "Missing X-Gateway-Authorization header. Search requests must be routed through the gateway.",
        },
      });
      return;
    }

    try {
      const parsed = parseAuthHeader(gatewayAuthHeader);

      if (!parsed.subscriberId) {
        logger.warn("Invalid X-Gateway-Authorization: missing subscriberId");
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: "Invalid X-Gateway-Authorization header: unable to extract gateway subscriberId.",
          },
        });
        return;
      }

      const gateway = await registryClient.lookup(parsed.subscriberId);

      if (!gateway || !gateway.signing_public_key) {
        logger.warn(
          { subscriberId: parsed.subscriberId },
          "Gateway not found in registry or missing signing public key",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: `Gateway "${parsed.subscriberId}" not found in registry or missing public key.`,
          },
        });
        return;
      }

      if (gateway.type && gateway.type !== "BG") {
        logger.warn(
          { subscriberId: parsed.subscriberId, type: gateway.type },
          "X-Gateway-Authorization subscriber is not a BG (gateway)",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: `Subscriber "${parsed.subscriberId}" is not registered as a gateway (BG).`,
          },
        });
        return;
      }

      const body = request.body;
      if (!body || typeof body !== "object") {
        reply.code(400).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10000",
            message: "Request body is required for gateway signature verification.",
          },
        });
        return;
      }

      const isValid = verifyAuthHeader({
        header: gatewayAuthHeader,
        body: body as object,
        publicKey: gateway.signing_public_key,
      });

      if (!isValid) {
        logger.warn(
          { subscriberId: parsed.subscriberId },
          "X-Gateway-Authorization signature verification failed",
        );
        reply.code(401).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "CONTEXT-ERROR",
            code: "10001",
            message: "X-Gateway-Authorization signature verification failed.",
          },
        });
        return;
      }

      logger.debug(
        { subscriberId: parsed.subscriberId },
        "Gateway authorization verified successfully",
      );
    } catch (err) {
      logger.error({ err }, "Error verifying X-Gateway-Authorization header");
      reply.code(500).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "INTERNAL-ERROR",
          code: "20000",
          message: "Internal error during gateway authorization verification.",
        },
      });
    }
  };
}
