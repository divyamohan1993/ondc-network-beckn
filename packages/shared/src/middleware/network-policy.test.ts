import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createNetworkPolicyMiddleware,
  getActionSla,
  isWithinSla,
  ACTION_RESPONSE_SLA,
} from "./network-policy.js";

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

function createMockRequest(body: unknown, headers: Record<string, string> = {}) {
  return { body, headers, ip: "127.0.0.1", url: "/test", method: "POST" } as any;
}

function createMockReply() {
  const state = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, unknown> };
  const reply: any = {
    code: (c: number) => { state.statusCode = c; return reply; },
    send: (b: unknown) => { state.body = b; return reply; },
    header: (n: string, v: unknown) => { state.headers[n] = v; return reply; },
  };
  Object.defineProperty(reply, "_state", { get: () => state });
  return reply;
}

// ---------------------------------------------------------------------------
// createNetworkPolicyMiddleware
// ---------------------------------------------------------------------------

describe("createNetworkPolicyMiddleware", () => {
  it("passes requests for allowed domains", async () => {
    const handler = createNetworkPolicyMiddleware({
      allowedDomains: ["ONDC:RET10", "ONDC:RET11"],
    });

    const request = createMockRequest({
      context: { action: "search", domain: "ONDC:RET10" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("blocks requests for unlisted domains (400 NACK)", async () => {
    const handler = createNetworkPolicyMiddleware({
      allowedDomains: ["ONDC:RET10", "ONDC:RET11"],
    });

    const request = createMockRequest({
      context: { action: "search", domain: "ONDC:RET14" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30000",
        }),
      }),
    );
  });

  it("sets X-ONDC-Response-SLA header", async () => {
    const handler = createNetworkPolicyMiddleware({
      enforceSla: true,
    });

    const request = createMockRequest({
      context: { action: "search", domain: "ONDC:RET10" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    // search action has a 3000 ms SLA
    expect(reply._state.headers["X-ONDC-Response-SLA"]).toBe(3000);
  });

  it("passes requests without body", async () => {
    const handler = createNetworkPolicyMiddleware({
      allowedDomains: ["ONDC:RET10"],
    });

    const request = createMockRequest(undefined);
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("passes requests without context", async () => {
    const handler = createNetworkPolicyMiddleware({
      allowedDomains: ["ONDC:RET10"],
    });

    const request = createMockRequest({ someField: "value" });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("allows all domains when allowedDomains is not configured", async () => {
    const handler = createNetworkPolicyMiddleware({});

    const request = createMockRequest({
      context: { action: "search", domain: "ONDC:RET14" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("respects SLA overrides", async () => {
    const handler = createNetworkPolicyMiddleware({
      enforceSla: true,
      slaOverrides: { search: 1000 },
    });

    const request = createMockRequest({
      context: { action: "search", domain: "ONDC:RET10" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    // Should use the override value, not the default 3000
    expect(reply._state.headers["X-ONDC-Response-SLA"]).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe("getActionSla", () => {
  it("returns correct SLA ms for known actions", () => {
    expect(getActionSla("search")).toBe(3000);
    expect(getActionSla("on_search")).toBe(3000);
    expect(getActionSla("select")).toBe(5000);
    expect(getActionSla("confirm")).toBe(10000);
    expect(getActionSla("status")).toBe(5000);
    expect(getActionSla("cancel")).toBe(10000);
  });

  it("returns undefined for unknown actions", () => {
    expect(getActionSla("nonexistent_action")).toBeUndefined();
  });
});

describe("isWithinSla", () => {
  it("returns true when within SLA", () => {
    // search has 3000 ms SLA
    expect(isWithinSla("search", 1500)).toBe(true);
    expect(isWithinSla("search", 3000)).toBe(true); // exactly at SLA
    expect(isWithinSla("confirm", 9999)).toBe(true);
  });

  it("returns false when exceeding SLA", () => {
    // search has 3000 ms SLA
    expect(isWithinSla("search", 3001)).toBe(false);
    expect(isWithinSla("search", 5000)).toBe(false);
    expect(isWithinSla("confirm", 10001)).toBe(false);
  });

  it("returns true for unknown actions (no SLA defined)", () => {
    expect(isWithinSla("unknown_action", 99999)).toBe(true);
  });
});
