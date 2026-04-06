import type { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../services/auth-service.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("user-auth");

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      phone: string;
      name: string | null;
      email: string | null;
      preferredLanguage: string | null;
    };
  }
}

/**
 * Create a Fastify preHandler that validates Bearer tokens via AuthService
 * and attaches the user to the request object.
 */
export function createUserAuthMiddleware(authService: AuthService) {
  return async function userAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid authorization header.",
          details: [],
        },
      });
      return;
    }

    const token = authHeader.slice(7);
    if (!token) {
      reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Empty token.",
          details: [],
        },
      });
      return;
    }

    const result = await authService.validateSession(token);
    if (!result.valid || !result.user) {
      logger.warn("Invalid or expired session token");
      reply.code(401).send({
        error: {
          code: "SESSION_EXPIRED",
          message: "Session expired. Please login again.",
          details: [],
        },
      });
      return;
    }

    request.user = result.user;
  };
}
