import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDuplicateDetector } from "./duplicate-detector.js";

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
// Tests
// ---------------------------------------------------------------------------

describe("createDuplicateDetector", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("allows first request with a new message_id", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });
    const request = createMockRequest({
      context: { message_id: "msg-001", action: "search" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    // Should NOT send a response (no block)
    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("blocks second request with the same message_id (400 with NACK)", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });

    const request1 = createMockRequest({
      context: { message_id: "msg-002", action: "search" },
    });
    const reply1 = createMockReply();
    await handler(request1, reply1);

    // First request should pass
    expect(reply1._state.body).toBeUndefined();

    // Second request with the same message_id should be blocked
    const request2 = createMockRequest({
      context: { message_id: "msg-002", action: "search" },
    });
    const reply2 = createMockReply();
    await handler(request2, reply2);

    expect(reply2._state.statusCode).toBe(400);
    expect(reply2._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30013",
        }),
      }),
    );
  });

  it("skips callback actions (on_*) — they reuse message_id", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });

    // First: a normal search request sets the message_id
    const request1 = createMockRequest({
      context: { message_id: "msg-003", action: "search" },
    });
    const reply1 = createMockReply();
    await handler(request1, reply1);
    expect(reply1._state.body).toBeUndefined();

    // Now a callback (on_search) with the same message_id should pass
    const request2 = createMockRequest({
      context: { message_id: "msg-003", action: "on_search" },
    });
    const reply2 = createMockReply();
    await handler(request2, reply2);

    expect(reply2._state.statusCode).toBe(200);
    expect(reply2._state.body).toBeUndefined();
  });

  it("passes through requests without body", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });
    const request = createMockRequest(undefined);
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("passes through requests without context", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });
    const request = createMockRequest({ someField: "value" });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("passes through requests without message_id", async () => {
    const handler = createDuplicateDetector({ redisClient: redis });
    const request = createMockRequest({
      context: { action: "search" },
    });
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("handles Redis errors gracefully (fail open)", async () => {
    const failingRedis = {
      get: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      set: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
    } as any;

    const handler = createDuplicateDetector({ redisClient: failingRedis });
    const request = createMockRequest({
      context: { message_id: "msg-err-01", action: "search" },
    });
    const reply = createMockReply();

    // Should NOT throw and should NOT block
    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });
});
