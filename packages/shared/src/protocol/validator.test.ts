import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateBecknRequest,
  parseDurationToMs,
  checkDuplicateMessageId,
} from "./validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid UUID v4 string. */
function uuid(): string {
  return "550e8400-e29b-41d4-a716-446655440000";
}

/** ISO timestamp for "now" (safe for the 5-minute freshness window). */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Build a minimal valid Beckn search request body.
 * Every field satisfies the validator so individual tests can remove / mutate
 * exactly one field at a time.
 */
function validSearchBody(): Record<string, unknown> {
  return {
    context: {
      domain: "ONDC:RET10",
      country: "IND",
      city: "std:080",
      core_version: "1.2.0",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      transaction_id: uuid(),
      message_id: uuid(),
      timestamp: nowISO(),
      ttl: "PT30S",
    },
    message: {
      intent: {
        descriptor: { name: "Milk" },
      },
    },
  };
}

/**
 * Build a valid non-search (e.g. select/confirm) request body.
 * Includes bpp_id and bpp_uri which are required for non-search actions.
 */
function validSelectBody(): Record<string, unknown> {
  return {
    context: {
      domain: "ONDC:RET10",
      country: "IND",
      city: "std:080",
      core_version: "1.2.0",
      action: "select",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      bpp_id: "seller-app.example.com",
      bpp_uri: "https://seller-app.example.com/beckn",
      transaction_id: uuid(),
      message_id: uuid(),
      timestamp: nowISO(),
      ttl: "PT30S",
    },
    message: {
      order: {
        provider: { id: "provider-1" },
        items: [{ id: "item-1", quantity: { count: 1 } }],
      },
    },
  };
}

function validConfirmBody(): Record<string, unknown> {
  const body = validSelectBody();
  (body.context as Record<string, unknown>).action = "confirm";
  return body;
}

// ---------------------------------------------------------------------------
// validateBecknRequest
// ---------------------------------------------------------------------------

describe("validateBecknRequest", () => {
  // Use fake timers so "now" is deterministic when testing stale/future timestamps
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Happy path -----------------------------------------------------------

  it("should pass for a valid search request", () => {
    const body = validSearchBody();
    (body.context as Record<string, unknown>).timestamp = new Date().toISOString();
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should pass for a valid select request with bpp_id/bpp_uri", () => {
    const body = validSelectBody();
    (body.context as Record<string, unknown>).timestamp = new Date().toISOString();
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should pass for a valid confirm request with bpp_id/bpp_uri", () => {
    const body = validConfirmBody();
    (body.context as Record<string, unknown>).timestamp = new Date().toISOString();
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --- Missing top-level fields ---------------------------------------------

  it("should fail when context is missing", () => {
    const body = validSearchBody();
    delete body.context;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("context"))).toBe(true);
  });

  it("should fail when message is missing", () => {
    const body = validSearchBody();
    (body.context as Record<string, unknown>).timestamp = new Date().toISOString();
    delete body.message;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("message"))).toBe(true);
  });

  it("should fail when body is null", () => {
    const result = validateBecknRequest(null);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-null object"))).toBe(true);
  });

  it("should fail when body is an array", () => {
    const result = validateBecknRequest([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-null object"))).toBe(true);
  });

  // --- Missing context fields -----------------------------------------------

  it("should fail when domain is missing", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    delete ctx.domain;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("domain"))).toBe(true);
  });

  it("should fail when bap_id is missing", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    delete ctx.bap_id;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bap_id"))).toBe(true);
  });

  it("should fail when bap_uri is missing", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    delete ctx.bap_uri;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bap_uri"))).toBe(true);
  });

  // --- Action validation ----------------------------------------------------

  it("should fail when action is invalid", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.action = "not_a_real_action";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("action"))).toBe(true);
  });

  // --- UUID validation ------------------------------------------------------

  it("should fail when transaction_id is not a valid UUID", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.transaction_id = "not-a-uuid";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("transaction_id"))).toBe(true);
  });

  it("should fail when message_id is not a valid UUID", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.message_id = "bad-message-id";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("message_id"))).toBe(true);
  });

  // --- Timestamp validation -------------------------------------------------

  it("should fail when timestamp is not valid ISO 8601", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = "June 15, 2025";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("timestamp"))).toBe(true);
  });

  it("should fail when timestamp is stale (more than 5 minutes old)", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    // 6 minutes in the past
    const staleDate = new Date(Date.now() - 6 * 60 * 1000);
    ctx.timestamp = staleDate.toISOString();
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("stale"))).toBe(true);
  });

  it("should fail when timestamp is in the future (more than 30s ahead)", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    // 60 seconds in the future
    const futureDate = new Date(Date.now() + 60 * 1000);
    ctx.timestamp = futureDate.toISOString();
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("future"))).toBe(true);
  });

  // --- TTL validation -------------------------------------------------------

  it("should fail when ttl has an invalid format", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.ttl = "30 seconds";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ttl"))).toBe(true);
  });

  it("should fail when message has expired (timestamp + ttl elapsed)", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    // Timestamp 2 minutes ago (within the 5-min freshness window)
    const pastDate = new Date(Date.now() - 2 * 60 * 1000);
    ctx.timestamp = pastDate.toISOString();
    // TTL of 30 seconds - so message expired 90 seconds ago
    ctx.ttl = "PT30S";
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expired"))).toBe(true);
  });

  // --- bpp_id / bpp_uri requirements ----------------------------------------

  it("should require bpp_id/bpp_uri for callback actions (on_search)", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.action = "on_search";
    // No bpp_id or bpp_uri
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bpp_id"))).toBe(true);
    expect(result.errors.some((e) => e.includes("bpp_uri"))).toBe(true);
  });

  it("should require bpp_id/bpp_uri for non-search actions (select)", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    ctx.action = "select";
    // No bpp_id or bpp_uri
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bpp_id"))).toBe(true);
    expect(result.errors.some((e) => e.includes("bpp_uri"))).toBe(true);
  });

  it("should NOT require bpp_id/bpp_uri for search action", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    // search is the action, and no bpp_id/bpp_uri
    delete ctx.bpp_id;
    delete ctx.bpp_uri;
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --- v1.2 nested location format ------------------------------------------

  it("should accept v1.2 nested location format for country and city", () => {
    const body = validSearchBody();
    const ctx = body.context as Record<string, unknown>;
    ctx.timestamp = new Date().toISOString();
    // Remove flat country/city
    delete ctx.country;
    delete ctx.city;
    // Add nested location
    ctx.location = {
      country: { code: "IND" },
      city: { code: "std:080" },
    };
    const result = validateBecknRequest(body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseDurationToMs
// ---------------------------------------------------------------------------

describe("parseDurationToMs", () => {
  it('should parse "PT30S" to 30000ms', () => {
    expect(parseDurationToMs("PT30S")).toBe(30000);
  });

  it('should parse "PT5M" to 300000ms', () => {
    expect(parseDurationToMs("PT5M")).toBe(300000);
  });

  it('should parse "PT1H" to 3600000ms', () => {
    expect(parseDurationToMs("PT1H")).toBe(3600000);
  });

  it('should parse "PT1H30M" to 5400000ms', () => {
    expect(parseDurationToMs("PT1H30M")).toBe(5400000);
  });

  it("should return null for an invalid format", () => {
    expect(parseDurationToMs("30 seconds")).toBeNull();
  });

  it("should return null for an empty string", () => {
    expect(parseDurationToMs("")).toBeNull();
  });

  it("should return null for a date-only duration like P1D", () => {
    // parseDurationToMs only supports PT{H}{M}{S}
    expect(parseDurationToMs("P1D")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkDuplicateMessageId
// ---------------------------------------------------------------------------

describe("checkDuplicateMessageId", () => {
  it("should return false on the first call (not a duplicate)", async () => {
    const store = new Map<string, string>();
    const mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
        store.set(key, value);
        return "OK";
      }),
    };

    const msgId = uuid();
    const isDuplicate = await checkDuplicateMessageId(msgId, mockRedis);
    expect(isDuplicate).toBe(false);
    expect(mockRedis.set).toHaveBeenCalledWith(`msg:dedup:${msgId}`, "1", "EX", 300);
  });

  it("should return true on the second call with the same ID (duplicate)", async () => {
    const store = new Map<string, string>();
    const mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
        store.set(key, value);
        return "OK";
      }),
    };

    const msgId = uuid();

    const first = await checkDuplicateMessageId(msgId, mockRedis);
    expect(first).toBe(false);

    const second = await checkDuplicateMessageId(msgId, mockRedis);
    expect(second).toBe(true);
  });

  it("should return false for a different message ID", async () => {
    const store = new Map<string, string>();
    const mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
        store.set(key, value);
        return "OK";
      }),
    };

    await checkDuplicateMessageId("550e8400-e29b-41d4-a716-446655440000", mockRedis);
    const result = await checkDuplicateMessageId(
      "660e8400-e29b-41d4-a716-446655440001",
      mockRedis,
    );
    expect(result).toBe(false);
  });
});
