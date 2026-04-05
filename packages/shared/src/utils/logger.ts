import pino, { type Logger } from "pino";

/**
 * Create a Pino logger instance for a specific service/module.
 *
 * Features:
 *   - JSON-formatted output (default pino behavior)
 *   - ISO timestamps
 *   - Service name included in every log line
 *   - Log level respects the LOG_LEVEL environment variable (defaults to "info")
 *
 * Usage:
 *   const logger = createLogger("my-service");
 *   logger.info("Server started");
 *   logger.error({ err }, "Something went wrong");
 *
 * @param serviceName - The name of the service or module creating the logger.
 * @returns A configured pino Logger instance.
 */
export function createLogger(serviceName: string): Logger {
  return pino({
    name: serviceName,
    level: process.env["LOG_LEVEL"] ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  });
}

/**
 * Create a child logger with trace context bound from a Fastify request.
 *
 * Every log line produced by the returned logger automatically includes
 * traceId, spanId, and parentSpanId fields for distributed trace correlation.
 *
 * @param request - A Fastify request decorated by the tracing middleware.
 * @returns A pino child Logger with trace fields bound.
 */
export function createRequestLogger(request: {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}): Logger {
  const base = createLogger("request");
  return base.child({
    traceId: request.traceId,
    spanId: request.spanId,
    parentSpanId: request.parentSpanId,
  });
}
