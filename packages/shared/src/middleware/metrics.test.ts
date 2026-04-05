import { describe, it, expect, vi, beforeEach } from "vitest";
import { metricsMiddleware } from "./metrics.js";
import { globalMetrics } from "../services/metrics-collector.js";

// ---------------------------------------------------------------------------
// Mock logger to prevent console noise during tests
// ---------------------------------------------------------------------------
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(body: unknown) {
  return { body, headers: {}, ip: "127.0.0.1", url: "/test", method: "POST" } as any;
}

function createMockReply(statusCode: number = 200) {
  let resolveCallback: (() => void) | undefined;
  const reply: any = {
    statusCode,
    then: (resolve: () => void, _reject: () => void) => {
      resolveCallback = resolve;
    },
  };
  // Expose a way to trigger the reply completion
  Object.defineProperty(reply, "_triggerComplete", {
    get: () => () => { if (resolveCallback) resolveCallback(); },
  });
  return reply;
}

// ---------------------------------------------------------------------------
// metricsMiddleware
// ---------------------------------------------------------------------------

describe("metricsMiddleware", () => {
  beforeEach(() => {
    globalMetrics.reset();
  });

  it("should record request timing for Beckn actions on reply complete", async () => {
    const request = createMockRequest({
      context: { action: "search", bap_id: "test-bap" },
    });
    const reply = createMockReply(200);

    await metricsMiddleware(request, reply);
    // Trigger reply completion
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(metrics["search"]).toBeDefined();
    expect(metrics["search"]!.totalRequests).toBe(1);
    expect(metrics["search"]!.successCount).toBe(1);
  });

  it("should ignore non-Beckn requests (no context.action)", async () => {
    const request = createMockRequest({ some: "data" });
    const reply = createMockReply(200);

    await metricsMiddleware(request, reply);
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(Object.keys(metrics)).toHaveLength(0);
  });

  it("should ignore requests with undefined body", async () => {
    const request = createMockRequest(undefined);
    const reply = createMockReply(200);

    await metricsMiddleware(request, reply);
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(Object.keys(metrics)).toHaveLength(0);
  });

  it("should record success for 2xx status codes", async () => {
    const request = createMockRequest({
      context: { action: "confirm" },
    });
    const reply = createMockReply(200);

    await metricsMiddleware(request, reply);
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(metrics["confirm"]!.successCount).toBe(1);
    expect(metrics["confirm"]!.errorCount).toBe(0);
  });

  it("should record failure for 4xx status codes", async () => {
    const request = createMockRequest({
      context: { action: "search" },
    });
    const reply = createMockReply(400);

    await metricsMiddleware(request, reply);
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(metrics["search"]!.errorCount).toBe(1);
    expect(metrics["search"]!.successCount).toBe(0);
  });

  it("should record failure for 5xx status codes", async () => {
    const request = createMockRequest({
      context: { action: "init" },
    });
    const reply = createMockReply(500);

    await metricsMiddleware(request, reply);
    reply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(metrics["init"]!.errorCount).toBe(1);
  });

  it("should track multiple actions independently", async () => {
    const searchReq = createMockRequest({ context: { action: "search" } });
    const searchReply = createMockReply(200);
    await metricsMiddleware(searchReq, searchReply);
    searchReply._triggerComplete();

    const confirmReq = createMockRequest({ context: { action: "confirm" } });
    const confirmReply = createMockReply(200);
    await metricsMiddleware(confirmReq, confirmReply);
    confirmReply._triggerComplete();

    const metrics = globalMetrics.getMetrics();
    expect(metrics["search"]!.totalRequests).toBe(1);
    expect(metrics["confirm"]!.totalRequests).toBe(1);
  });
});
