import type { FastifyRequest, FastifyReply } from "fastify";
import { globalMetrics } from "../services/metrics-collector.js";

/**
 * Fastify preHandler hook that records request metrics after response is sent.
 * Uses reply.then() to capture timing after the response completes,
 * matching the pattern used by the tracing middleware.
 */
export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const startTime = Date.now();

  reply.then(
    () => {
      const body = request.body as Record<string, Record<string, unknown>> | undefined;
      const action = body?.context?.action as string | undefined;
      if (!action) return; // Only track Beckn action requests

      const elapsed = Date.now() - startTime;
      const success = reply.statusCode >= 200 && reply.statusCode < 400;
      const slaMs = (request as unknown as Record<string, unknown>).ondcSlaMs as number | undefined;

      globalMetrics.recordRequest(action, elapsed, success, slaMs);
    },
    () => {
      // Reply rejected / aborted, skip metrics recording
    },
  );
}
