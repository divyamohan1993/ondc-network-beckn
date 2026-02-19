import type { FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@ondc/shared";

const logger = createLogger("orchestrator-auth");

/**
 * Pre-handler hook that verifies the request has a valid authentication
 * token. Accepts either:
 *   - x-internal-api-key header matching INTERNAL_API_KEY env var
 *   - x-admin-token header matching ADMIN_TOKEN env var
 *
 * If neither environment variable is set, authentication is disabled
 * (development mode convenience).
 */
export async function verifyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const internalApiKey = process.env["INTERNAL_API_KEY"];
  const adminToken = process.env["ADMIN_TOKEN"];

  // If no keys are configured, skip auth (development convenience)
  if (!internalApiKey && !adminToken) {
    return;
  }

  const requestInternalKey = request.headers["x-internal-api-key"] as string | undefined;
  const requestAdminToken = request.headers["x-admin-token"] as string | undefined;

  // Check internal API key
  if (internalApiKey && requestInternalKey === internalApiKey) {
    return;
  }

  // Check admin token
  if (adminToken && requestAdminToken === adminToken) {
    return;
  }

  logger.warn(
    {
      url: request.url,
      method: request.method,
      ip: request.ip,
    },
    "Unauthorized request",
  );

  return reply.code(401).send({
    error: "Unauthorized",
    message: "Valid x-internal-api-key or x-admin-token header required",
  });
}
