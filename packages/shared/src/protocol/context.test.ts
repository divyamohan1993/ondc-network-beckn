import { describe, it, expect } from "vitest";
import { buildContext } from "./context.js";

// ---------------------------------------------------------------------------
// UUID v4 regex for assertions
// ---------------------------------------------------------------------------
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// buildContext
// ---------------------------------------------------------------------------

describe("buildContext", () => {
  it("should return all required fields", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.domain).toBe("ONDC:RET10");
    expect(ctx.action).toBe("search");
    expect(ctx.bap_id).toBe("buyer-app.example.com");
    expect(ctx.bap_uri).toBe("https://buyer-app.example.com/beckn");
    expect(ctx.transaction_id).toBeDefined();
    expect(ctx.message_id).toBeDefined();
    expect(ctx.timestamp).toBeDefined();
    expect(ctx.ttl).toBeDefined();
    expect(ctx.country).toBeDefined();
    expect(ctx.city).toBeDefined();
    expect(ctx.core_version).toBeDefined();
  });

  it("should auto-generate transaction_id as a valid UUID", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.transaction_id).toMatch(UUID_V4_RE);
  });

  it("should auto-generate message_id as a valid UUID", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.message_id).toMatch(UUID_V4_RE);
  });

  it("should auto-generate timestamp as a valid ISO 8601 string", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    // Parsing the timestamp should produce a valid Date
    const parsed = new Date(ctx.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
    // Should contain the 'T' separator
    expect(ctx.timestamp).toContain("T");
  });

  it("should use provided overrides instead of auto-generated values", () => {
    const overrides = {
      domain: "ONDC:RET11",
      action: "on_search" as const,
      bap_id: "custom-bap",
      bap_uri: "https://custom-bap.example.com",
      transaction_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      message_id: "11111111-2222-3333-4444-555555555555",
      timestamp: "2025-01-01T00:00:00.000Z",
      ttl: "PT60S",
      core_version: "1.1.0",
    };

    const ctx = buildContext(overrides);

    expect(ctx.domain).toBe("ONDC:RET11");
    expect(ctx.action).toBe("on_search");
    expect(ctx.transaction_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(ctx.message_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(ctx.timestamp).toBe("2025-01-01T00:00:00.000Z");
    expect(ctx.ttl).toBe("PT60S");
    expect(ctx.core_version).toBe("1.1.0");
  });

  it('should default country to "IND"', () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.country).toBe("IND");
  });

  it('should default city to "std:080"', () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.city).toBe("std:080");
  });

  it('should default core_version to "1.2.0"', () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.core_version).toBe("1.2.0");
  });

  it("should emit both v1.1 (country, city, core_version) and v1.2 (location, version) fields", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    // v1.1 flat fields
    expect(ctx.country).toBe("IND");
    expect(ctx.city).toBe("std:080");
    expect(ctx.core_version).toBe("1.2.0");

    // v1.2 nested fields
    expect(ctx.location).toBeDefined();
    expect(ctx.location?.country?.code).toBe("IND");
    expect(ctx.location?.city?.code).toBe("std:080");
    expect(ctx.version).toBe("1.2.0");
  });

  it("should include key when provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      key: "my-encryption-key",
    });

    expect(ctx.key).toBe("my-encryption-key");
  });

  it("should not include key when not provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.key).toBeUndefined();
  });

  it("should include max_callbacks when provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      max_callbacks: 5,
    });

    expect(ctx.max_callbacks).toBe(5);
  });

  it("should not include max_callbacks when not provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.max_callbacks).toBeUndefined();
  });

  it("should default ttl to PT30S", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
    });

    expect(ctx.ttl).toBe("PT30S");
  });

  it("should propagate bpp_id and bpp_uri when provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "select",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      bpp_id: "seller-app.example.com",
      bpp_uri: "https://seller-app.example.com/beckn",
    });

    expect(ctx.bpp_id).toBe("seller-app.example.com");
    expect(ctx.bpp_uri).toBe("https://seller-app.example.com/beckn");
  });

  it("should use custom country and city when provided", () => {
    const ctx = buildContext({
      domain: "ONDC:RET10",
      action: "search",
      bap_id: "buyer-app.example.com",
      bap_uri: "https://buyer-app.example.com/beckn",
      country: "USA",
      city: "std:011",
    });

    // Flat fields
    expect(ctx.country).toBe("USA");
    expect(ctx.city).toBe("std:011");

    // Nested fields should mirror
    expect(ctx.location?.country?.code).toBe("USA");
    expect(ctx.location?.city?.code).toBe("std:011");
  });
});
