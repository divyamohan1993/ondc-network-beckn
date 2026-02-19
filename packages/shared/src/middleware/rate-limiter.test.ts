import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRateLimiterMiddleware, createSubscriberRateLimiter } from "./rate-limiter.js";

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

function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    get: async (key: string) => { const e = store.get(key); return e ? e.value : null; },
    set: async (key: string, value: string, mode?: string, ttl?: number) => { store.set(key, { value, expiresAt: mode === "EX" && ttl ? Date.now() + ttl * 1000 : undefined }); return "OK"; },
    incr: async (key: string) => { const e = store.get(key); const n = (e ? parseInt(e.value) : 0) + 1; store.set(key, { value: String(n), expiresAt: e?.expiresAt }); return n; },
    expire: async (key: string, s: number) => { const e = store.get(key); if (e) { e.expiresAt = Date.now() + s * 1000; return 1; } return 0; },
    ttl: async (key: string) => { const e = store.get(key); if (!e?.expiresAt) return -1; return Math.max(0, Math.floor((e.expiresAt - Date.now()) / 1000)); },
    _clear: () => store.clear(),
  } as any;
}

// ---------------------------------------------------------------------------
// createRateLimiterMiddleware
// ---------------------------------------------------------------------------

describe("createRateLimiterMiddleware", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("allows requests within the limit", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 5,
      windowSeconds: 60,
    });

    const request = createMockRequest({
      context: { bap_id: "buyer-app-1", action: "search" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("blocks requests exceeding the limit (429)", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 3,
      windowSeconds: 60,
    });

    // Send 3 requests — all should pass
    for (let i = 0; i < 3; i++) {
      const req = createMockRequest({
        context: { bap_id: "buyer-app-2", action: "search" },
      });
      const rep = createMockReply();
      await handler(req, rep);
      expect(rep._state.body).toBeUndefined();
    }

    // 4th request should be blocked
    const req4 = createMockRequest({
      context: { bap_id: "buyer-app-2", action: "search" },
    });
    const rep4 = createMockReply();
    await handler(req4, rep4);

    expect(rep4._state.statusCode).toBe(429);
    expect(rep4._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30001",
        }),
      }),
    );
  });

  it("sets X-RateLimit-* headers", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 10,
      windowSeconds: 60,
    });

    const request = createMockRequest({
      context: { bap_id: "buyer-app-3", action: "search" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.headers["X-RateLimit-Limit"]).toBe(10);
    expect(reply._state.headers["X-RateLimit-Remaining"]).toBe(9);
    expect(reply._state.headers["X-RateLimit-Reset"]).toBeDefined();
  });

  it("extracts subscriber from body context.bap_id", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 2,
      windowSeconds: 60,
    });

    // Two different bap_ids — each should have their own counter
    const req1 = createMockRequest({
      context: { bap_id: "bap-A", action: "search" },
    });
    const rep1 = createMockReply();
    await handler(req1, rep1);

    const req2 = createMockRequest({
      context: { bap_id: "bap-B", action: "search" },
    });
    const rep2 = createMockReply();
    await handler(req2, rep2);

    // Each subscriber has only made 1 request, both should pass
    expect(rep1._state.body).toBeUndefined();
    expect(rep2._state.body).toBeUndefined();

    // Second request for bap-A should still be within limit
    const req3 = createMockRequest({
      context: { bap_id: "bap-A", action: "search" },
    });
    const rep3 = createMockReply();
    await handler(req3, rep3);
    expect(rep3._state.body).toBeUndefined();

    // Third request for bap-A exceeds limit
    const req4 = createMockRequest({
      context: { bap_id: "bap-A", action: "search" },
    });
    const rep4 = createMockReply();
    await handler(req4, rep4);
    expect(rep4._state.statusCode).toBe(429);
  });

  it("extracts subscriber from Authorization header keyId", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 2,
      windowSeconds: 60,
    });

    // No bap_id in body, but has Authorization header with keyId
    const request = createMockRequest(
      {},
      { authorization: 'Signature keyId="subscriber-xyz|ed25519|key1" ...' },
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.body).toBeUndefined();
    // Verify it's using the subscriber key, not an IP key
    const hasSubscriberKey = await redis.get("ratelimit:subscriber-xyz");
    expect(hasSubscriberKey).not.toBeNull();
  });

  it("falls back to IP-based limiting", async () => {
    const handler = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 2,
      windowSeconds: 60,
    });

    // No bap_id and no Authorization header
    const request = createMockRequest({});
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.body).toBeUndefined();
    // Should have created a key using the IP
    const hasIpKey = await redis.get("ratelimit:ip:127.0.0.1");
    expect(hasIpKey).not.toBeNull();
  });

  it("Redis errors don't block requests (fail open)", async () => {
    const failingRedis = {
      incr: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      expire: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      ttl: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
    } as any;

    const handler = createRateLimiterMiddleware({
      redisClient: failingRedis,
      maxRequests: 5,
      windowSeconds: 60,
    });

    const request = createMockRequest({
      context: { bap_id: "bap-fail", action: "search" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createSubscriberRateLimiter
// ---------------------------------------------------------------------------

describe("createSubscriberRateLimiter", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("allows requests within subscriber limit", async () => {
    const handler = createSubscriberRateLimiter({
      redisClient: redis,
      maxRequests: 5,
      windowSeconds: 60,
    });

    const request = createMockRequest(
      {},
      { authorization: 'Signature keyId="sub-001|ed25519|key1" ...' },
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("blocks requests exceeding subscriber limit", async () => {
    const handler = createSubscriberRateLimiter({
      redisClient: redis,
      maxRequests: 2,
      windowSeconds: 60,
    });

    for (let i = 0; i < 2; i++) {
      const req = createMockRequest(
        {},
        { authorization: 'Signature keyId="sub-002|ed25519|key1" ...' },
      );
      const rep = createMockReply();
      await handler(req, rep);
      expect(rep._state.body).toBeUndefined();
    }

    // 3rd request should be blocked
    const req3 = createMockRequest(
      {},
      { authorization: 'Signature keyId="sub-002|ed25519|key1" ...' },
    );
    const rep3 = createMockReply();
    await handler(req3, rep3);

    expect(rep3._state.statusCode).toBe(429);
    expect(rep3._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30001",
        }),
      }),
    );
  });

  it("uses different limits for IP-based vs subscriber", async () => {
    const handler = createSubscriberRateLimiter({
      redisClient: redis,
      maxRequests: 2,      // subscriber limit
      ipMaxRequests: 5,    // IP limit (higher)
      windowSeconds: 60,
      ipFallback: true,
    });

    // Subscriber-identified request — should use maxRequests=2
    const subReq1 = createMockRequest(
      {},
      { authorization: 'Signature keyId="sub-003|ed25519|key1" ...' },
    );
    const subRep1 = createMockReply();
    await handler(subReq1, subRep1);
    expect(subRep1._state.headers["X-RateLimit-Limit"]).toBe(2);

    // IP-based request (no auth header) — should use ipMaxRequests=5
    const ipReq1 = createMockRequest({});
    const ipRep1 = createMockReply();
    await handler(ipReq1, ipRep1);
    expect(ipRep1._state.headers["X-RateLimit-Limit"]).toBe(5);
  });
});
