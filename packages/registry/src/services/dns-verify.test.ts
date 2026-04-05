import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dns/promises
// ---------------------------------------------------------------------------
const mockResolveTxt = vi.fn();
vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: any[]) => mockResolveTxt(...args),
}));

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------
vi.mock("@ondc/shared/utils", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { verifyDnsTxtRecord } from "./dns-verify.js";

// ---------------------------------------------------------------------------
// DNS verification tests
// ---------------------------------------------------------------------------

describe("verifyDnsTxtRecord", () => {
  beforeEach(() => {
    mockResolveTxt.mockReset();
  });

  it("should return verified:true when TXT record matches", async () => {
    const publicKey = "abc123base64key";
    mockResolveTxt.mockResolvedValue([
      ["ondc-signing-key=", publicKey],
      ["v=spf1 include:example.com"],
    ]);

    const result = await verifyDnsTxtRecord("seller.example.com", publicKey);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should return verified:false when no TXT record found", async () => {
    mockResolveTxt.mockResolvedValue([
      ["v=spf1 include:example.com"],
    ]);

    const result = await verifyDnsTxtRecord("seller.example.com", "somekey");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("No ondc-signing-key TXT record found");
  });

  it("should return verified:false when key does not match", async () => {
    mockResolveTxt.mockResolvedValue([
      ["ondc-signing-key=wrongkey"],
    ]);

    const result = await verifyDnsTxtRecord("seller.example.com", "correctkey");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("does not match");
  });

  it("should handle ENOTFOUND errors gracefully", async () => {
    const err = new Error("queryTxt ENOTFOUND seller.example.com") as any;
    err.code = "ENOTFOUND";
    mockResolveTxt.mockRejectedValue(err);

    const result = await verifyDnsTxtRecord("seller.example.com", "somekey");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("No DNS records found");
  });

  it("should handle ENODATA errors gracefully", async () => {
    const err = new Error("queryTxt ENODATA seller.example.com") as any;
    err.code = "ENODATA";
    mockResolveTxt.mockRejectedValue(err);

    const result = await verifyDnsTxtRecord("seller.example.com", "somekey");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("No DNS records found");
  });

  it("should handle unexpected DNS errors", async () => {
    const err = new Error("Network timeout");
    mockResolveTxt.mockRejectedValue(err);

    const result = await verifyDnsTxtRecord("seller.example.com", "somekey");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("DNS lookup failed");
    expect(result.error).toContain("Network timeout");
  });

  it("should join TXT record chunks before matching", async () => {
    // TXT records can come as arrays of chunks
    const publicKey = "longbase64keyvalue";
    mockResolveTxt.mockResolvedValue([
      ["ondc-signing-key=", "longbase64", "keyvalue"],
    ]);

    const result = await verifyDnsTxtRecord("seller.example.com", publicKey);

    expect(result.verified).toBe(true);
  });

  it("should return verified:true for single-chunk TXT record", async () => {
    const publicKey = "mykey123";
    mockResolveTxt.mockResolvedValue([
      [`ondc-signing-key=${publicKey}`],
    ]);

    const result = await verifyDnsTxtRecord("seller.example.com", publicKey);

    expect(result.verified).toBe(true);
  });
});
