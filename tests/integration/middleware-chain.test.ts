import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// Mock Redis
function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    get: async (key: string) => { const e = store.get(key); return e ? e.value : null; },
    set: async (key: string, value: string, mode?: string, ttl?: number) => { store.set(key, { value, expiresAt: mode === "EX" && ttl ? Date.now() + ttl * 1000 : undefined }); return "OK"; },
    incr: async (key: string) => { const e = store.get(key); const n = (e ? parseInt(e.value) : 0) + 1; store.set(key, { value: String(n), expiresAt: e?.expiresAt }); return n; },
    expire: async (key: string, s: number) => { const e = store.get(key); if (e) { e.expiresAt = Date.now() + s * 1000; return 1; } return 0; },
    ttl: async () => 60,
    _clear: () => store.clear(),
  } as any;
}

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
  Object.defineProperty(reply, '_state', { get: () => state });
  return reply;
}

import { createDuplicateDetector } from "../../packages/shared/src/middleware/duplicate-detector.js";
import { createRateLimiterMiddleware } from "../../packages/shared/src/middleware/rate-limiter.js";
import { createNetworkPolicyMiddleware } from "../../packages/shared/src/middleware/network-policy.js";

describe("Middleware Chain Integration", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("rate limiter + dedup detector work in sequence", async () => {
    const rateLimiter = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 10,
      windowSeconds: 60,
    });
    const dedup = createDuplicateDetector({ redisClient: redis });

    const body = {
      context: {
        action: "search",
        bap_id: "bap.example.com",
        message_id: randomUUID(),
      },
      message: {},
    };

    const req = createMockRequest(body);
    const reply1 = createMockReply();

    // Rate limiter should pass
    await rateLimiter(req, reply1);
    expect(reply1._state.statusCode).toBe(200);

    // Dedup should pass (first time)
    const reply2 = createMockReply();
    await dedup(req, reply2);
    expect(reply2._state.statusCode).toBe(200);

    // Dedup should block (duplicate)
    const reply3 = createMockReply();
    await dedup(req, reply3);
    expect(reply3._state.statusCode).toBe(400);
  });

  it("network policy + rate limiter work in sequence", async () => {
    const policy = createNetworkPolicyMiddleware({
      allowedDomains: ["ONDC:RET10", "ONDC:RET11"],
      enforceSla: true,
    });
    const rateLimiter = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 5,
    });

    // Allowed domain
    const body = {
      context: { domain: "ONDC:RET10", action: "search", bap_id: "bap.example.com" },
      message: {},
    };
    const req = createMockRequest(body);
    const reply = createMockReply();
    await policy(req, reply);
    expect(reply._state.statusCode).toBe(200);

    // Blocked domain
    const blockedBody = {
      context: { domain: "ONDC:INVALID", action: "search" },
      message: {},
    };
    const req2 = createMockRequest(blockedBody);
    const reply2 = createMockReply();
    await policy(req2, reply2);
    expect(reply2._state.statusCode).toBe(400);
  });

  it("rate limiter blocks after exceeding limit across multiple middleware calls", async () => {
    const rateLimiter = createRateLimiterMiddleware({
      redisClient: redis,
      maxRequests: 3,
      windowSeconds: 60,
    });

    const body = { context: { bap_id: "flood-subscriber" }, message: {} };

    for (let i = 0; i < 3; i++) {
      const req = createMockRequest(body);
      const reply = createMockReply();
      await rateLimiter(req, reply);
      expect(reply._state.statusCode).toBe(200);
    }

    // 4th request should be blocked
    const req = createMockRequest(body);
    const reply = createMockReply();
    await rateLimiter(req, reply);
    expect(reply._state.statusCode).toBe(429);
  });
});
