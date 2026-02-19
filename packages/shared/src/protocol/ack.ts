import type { BecknAck, BecknNack } from "./types.js";

/**
 * Create a standard Beckn ACK response.
 * @returns BecknAck with status "ACK".
 */
export function ack(): BecknAck {
  return {
    message: {
      ack: {
        status: "ACK",
      },
    },
  };
}

/**
 * Create a standard Beckn NACK response with error details.
 * @param errorType - The error type (e.g. "DOMAIN-ERROR", "CONTEXT-ERROR", "POLICY-ERROR").
 * @param errorCode - The error code string.
 * @param errorMessage - Human-readable error message.
 * @returns BecknNack with status "NACK" and error details.
 */
export function nack(
  errorType: string,
  errorCode: string,
  errorMessage: string,
): BecknNack {
  return {
    message: {
      ack: {
        status: "NACK",
      },
    },
    error: {
      type: errorType,
      code: errorCode,
      message: errorMessage,
    },
  };
}
