import { describe, it, expect, vi } from "vitest";
import { tracingMiddleware, buildTraceHeaders, TRACE_ID_HEADER, SPAN_ID_HEADER, PARENT_SPAN_HEADER } from "./tracing.js";

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

function createMockRequest(headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    headers,
    body,
    method: "POST",
    url: "/search",
    ip: "127.0.0.1",
    traceId: undefined as string | undefined,
    spanId: undefined as string | undefined,
    parentSpanId: undefined as string | undefined,
  } as any;
}

function createMockReply() {
  const state = { headers: {} as Record<string, unknown>, statusCode: 200 };
  const thenCallbacks: Array<() => void> = [];
  const reply: any = {
    header: (n: string, v: unknown) => { state.headers[n] = v; return reply; },
    then: (resolve: () => void, _reject: () => void) => { thenCallbacks.push(resolve); },
    statusCode: 200,
  };
  Object.defineProperty(reply, "_state", { get: () => state });
  Object.defineProperty(reply, "_thenCallbacks", { get: () => thenCallbacks });
  return reply;
}

// ---------------------------------------------------------------------------
// tracingMiddleware
// ---------------------------------------------------------------------------

describe("tracingMiddleware", () => {
  it("should set traceId on request", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.traceId).toBeDefined();
    expect(typeof request.traceId).toBe("string");
    expect(request.traceId.length).toBeGreaterThan(0);
  });

  it("should preserve incoming x-trace-id header", async () => {
    const existingTraceId = "abc-123-existing-trace";
    const request = createMockRequest({ [TRACE_ID_HEADER]: existingTraceId });
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.traceId).toBe(existingTraceId);
  });

  it("should generate new traceId if not present in headers", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.traceId).toBeDefined();
    // UUID format check
    expect(request.traceId.length).toBeGreaterThan(8);
  });

  it("should set spanId on request", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.spanId).toBeDefined();
    expect(typeof request.spanId).toBe("string");
    expect(request.spanId.length).toBe(16);
  });

  it("should set parentSpanId from incoming x-span-id header", async () => {
    const incomingSpanId = "parent-span-abcd";
    const request = createMockRequest({ [SPAN_ID_HEADER]: incomingSpanId });
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.parentSpanId).toBe(incomingSpanId);
  });

  it("should leave parentSpanId undefined when no x-span-id header", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(request.parentSpanId).toBeUndefined();
  });

  it("should set trace headers on reply", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);
    expect(reply._state.headers[TRACE_ID_HEADER]).toBe(request.traceId);
    expect(reply._state.headers[SPAN_ID_HEADER]).toBe(request.spanId);
  });

  it("should generate different spanIds for different requests", async () => {
    const request1 = createMockRequest();
    const reply1 = createMockReply();
    await tracingMiddleware(request1, reply1);

    const request2 = createMockRequest();
    const reply2 = createMockReply();
    await tracingMiddleware(request2, reply2);

    expect(request1.spanId).not.toBe(request2.spanId);
  });
});

// ---------------------------------------------------------------------------
// buildTraceHeaders
// ---------------------------------------------------------------------------

describe("buildTraceHeaders", () => {
  it("should return correct trace headers", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);

    const headers = buildTraceHeaders(request);
    expect(headers[TRACE_ID_HEADER]).toBe(request.traceId);
    expect(headers[PARENT_SPAN_HEADER]).toBe(request.spanId);
    expect(headers[SPAN_ID_HEADER]).toBeDefined();
    expect(typeof headers[SPAN_ID_HEADER]).toBe("string");
  });

  it("should generate a new spanId (not reuse the request spanId)", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);

    const headers = buildTraceHeaders(request);
    expect(headers[SPAN_ID_HEADER]).not.toBe(request.spanId);
  });

  it("should set parent-span-id to the request's spanId", async () => {
    const request = createMockRequest();
    const reply = createMockReply();
    await tracingMiddleware(request, reply);

    const headers = buildTraceHeaders(request);
    expect(headers[PARENT_SPAN_HEADER]).toBe(request.spanId);
  });
});
