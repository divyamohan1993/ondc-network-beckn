import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("beckn-error-handler");

/**
 * Maps common HTTP error status codes to ONDC error types and codes.
 */
interface BecknErrorMapping {
  type: string;
  code: string;
}

function mapErrorToONDC(statusCode: number): BecknErrorMapping {
  if (statusCode >= 400 && statusCode < 500) {
    switch (statusCode) {
      case 400:
        return { type: "CONTEXT-ERROR", code: "10000" };
      case 401:
        return { type: "CONTEXT-ERROR", code: "10001" };
      case 403:
        return { type: "POLICY-ERROR", code: "30001" };
      case 404:
        return { type: "DOMAIN-ERROR", code: "40000" };
      case 422:
        return { type: "CONTEXT-ERROR", code: "10000" };
      default:
        return { type: "CONTEXT-ERROR", code: "10000" };
    }
  }

  // 5xx and everything else
  return { type: "INTERNAL-ERROR", code: "20000" };
}

/**
 * Standard Beckn error handler for Fastify.
 *
 * Maps errors to proper ONDC NACK responses with appropriate error types
 * and codes. All errors are logged and returned in the standard Beckn
 * error format.
 *
 * Usage:
 *   fastify.setErrorHandler(becknErrorHandler);
 *
 * @param error - The Fastify error object.
 * @param request - The Fastify request.
 * @param reply - The Fastify reply.
 */
export function becknErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = error.statusCode ?? 500;

  logger.error(
    {
      err: error,
      url: request.url,
      method: request.method,
      statusCode,
    },
    "Beckn request error",
  );

  const { type, code } = mapErrorToONDC(statusCode);

  const errorMessage =
    statusCode >= 500
      ? "Internal server error. Please try again later."
      : error.message || "An error occurred processing the request.";

  reply.code(statusCode).send({
    message: {
      ack: {
        status: "NACK",
      },
    },
    error: {
      type,
      code,
      message: errorMessage,
    },
  });
}
