import { randomUUID } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tracing");

// Header names for distributed tracing
const TRACE_ID_HEADER = "x-trace-id";
const SPAN_ID_HEADER = "x-span-id";
const PARENT_SPAN_HEADER = "x-parent-span-id";

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  }
}

/**
 * Distributed tracing middleware.
 * Propagates trace context across service boundaries via HTTP headers.
 *
 * If an incoming request has x-trace-id, it is preserved (same transaction).
 * Each service creates a new span-id for its own processing.
 */
export async function tracingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Extract or generate trace ID
  const traceId = (request.headers[TRACE_ID_HEADER] as string) || randomUUID();
  const parentSpanId = request.headers[SPAN_ID_HEADER] as string | undefined;
  const spanId = randomUUID().slice(0, 16);

  // Attach to request for downstream use
  request.traceId = traceId;
  request.spanId = spanId;
  request.parentSpanId = parentSpanId;

  // Set response headers
  reply.header(TRACE_ID_HEADER, traceId);
  reply.header(SPAN_ID_HEADER, spanId);

  // Log request with trace context on response completion
  const startTime = Date.now();

  reply.then(() => {
    const elapsed = Date.now() - startTime;
    logger.info({
      traceId,
      spanId,
      parentSpanId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      elapsed,
      ip: request.ip,
      action: (request.body as Record<string, unknown>)?.context
        ? ((request.body as Record<string, Record<string, unknown>>).context.action as string)
        : undefined,
      transactionId: (request.body as Record<string, unknown>)?.context
        ? ((request.body as Record<string, Record<string, unknown>>).context.transaction_id as string)
        : undefined,
      messageId: (request.body as Record<string, unknown>)?.context
        ? ((request.body as Record<string, Record<string, unknown>>).context.message_id as string)
        : undefined,
    }, `${request.method} ${request.url} ${reply.statusCode} ${elapsed}ms`);
  }, () => { /* reply rejected, already logged elsewhere */ });
}

/**
 * Build trace headers for outgoing HTTP requests.
 * Propagates the current trace context to downstream services.
 */
export function buildTraceHeaders(request: FastifyRequest): Record<string, string> {
  return {
    [TRACE_ID_HEADER]: request.traceId,
    [SPAN_ID_HEADER]: randomUUID().slice(0, 16),
    [PARENT_SPAN_HEADER]: request.spanId,
  };
}

/**
 * Build trace headers from raw trace context values.
 * Used when the Fastify request object is not available (e.g. queue consumers).
 */
export function buildTraceHeadersFromContext(
  traceId: string,
  parentSpanId: string,
): Record<string, string> {
  return {
    [TRACE_ID_HEADER]: traceId,
    [SPAN_ID_HEADER]: randomUUID().slice(0, 16),
    [PARENT_SPAN_HEADER]: parentSpanId,
  };
}

export { TRACE_ID_HEADER, SPAN_ID_HEADER, PARENT_SPAN_HEADER };
