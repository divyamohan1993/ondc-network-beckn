import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildAuthHeader,
  buildGatewayAuthHeader,
  parseAuthHeader,
  verifyAuthHeader,
} from "./auth-header.js";
import { generateKeyPair } from "./ed25519.js";

describe("auth-header", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildAuthHeader()", () => {
    it('returns a string starting with "Signature "', () => {
      const kp = generateKeyPair();
      const header = buildAuthHeader({
        subscriberId: "example.com",
        uniqueKeyId: "key1",
        privateKey: kp.privateKey,
        body: { context: {}, message: {} },
      });
      expect(header.startsWith("Signature ")).toBe(true);
    });

    it("contains all required fields: keyId, algorithm, created, expires, headers, signature", () => {
      const kp = generateKeyPair();
      const header = buildAuthHeader({
        subscriberId: "example.com",
        uniqueKeyId: "key1",
        privateKey: kp.privateKey,
        body: { test: true },
      });
      expect(header).toContain('keyId="example.com|key1|ed25519"');
      expect(header).toContain('algorithm="ed25519"');
      expect(header).toMatch(/created="\d+"/);
      expect(header).toMatch(/expires="\d+"/);
      expect(header).toContain('headers="(created) (expires) digest"');
      expect(header).toMatch(/signature="[A-Za-z0-9+/]+=*"/);
    });

    it("sets expires to created + 300 (5 minutes)", () => {
      const kp = generateKeyPair();
      const now = Math.floor(Date.now() / 1000);
      const header = buildAuthHeader({
        subscriberId: "sub1",
        uniqueKeyId: "uk1",
        privateKey: kp.privateKey,
        body: {},
      });
      const parsed = parseAuthHeader(header);
      const created = parseInt(parsed.created, 10);
      const expires = parseInt(parsed.expires, 10);
      expect(expires - created).toBe(300);
      // created should be very close to current time (within 2 seconds)
      expect(Math.abs(created - now)).toBeLessThanOrEqual(2);
    });

    it("formats keyId as subscriberId|uniqueKeyId|ed25519", () => {
      const kp = generateKeyPair();
      const header = buildAuthHeader({
        subscriberId: "my-subscriber.ondc.org",
        uniqueKeyId: "ed25519-key-abc123",
        privateKey: kp.privateKey,
        body: { data: "test" },
      });
      expect(header).toContain('keyId="my-subscriber.ondc.org|ed25519-key-abc123|ed25519"');
    });

    it("produces different signatures for different bodies", () => {
      const kp = generateKeyPair();
      const params = {
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
      };
      const header1 = buildAuthHeader({ ...params, body: { value: 1 } });
      const header2 = buildAuthHeader({ ...params, body: { value: 2 } });
      const parsed1 = parseAuthHeader(header1);
      const parsed2 = parseAuthHeader(header2);
      expect(parsed1.signature).not.toBe(parsed2.signature);
    });
  });

  describe("parseAuthHeader()", () => {
    it("extracts all fields from a well-formed header", () => {
      const header =
        'Signature keyId="sub.com|mykey|ed25519",' +
        'algorithm="ed25519",' +
        'created="1700000000",' +
        'expires="1700000300",' +
        'headers="(created) (expires) digest",' +
        'signature="dGVzdHNpZw=="';

      const parsed = parseAuthHeader(header);
      expect(parsed.keyId).toBe("sub.com|mykey|ed25519");
      expect(parsed.algorithm).toBe("ed25519");
      expect(parsed.created).toBe("1700000000");
      expect(parsed.expires).toBe("1700000300");
      expect(parsed.headers).toBe("(created) (expires) digest");
      expect(parsed.signature).toBe("dGVzdHNpZw==");
      expect(parsed.subscriberId).toBe("sub.com");
      expect(parsed.uniqueKeyId).toBe("mykey");
    });

    it('handles the "Signature " prefix', () => {
      const header =
        'Signature keyId="a|b|ed25519",algorithm="ed25519",' +
        'created="1",expires="2",headers="h",signature="sig"';
      const parsed = parseAuthHeader(header);
      expect(parsed.subscriberId).toBe("a");
      expect(parsed.uniqueKeyId).toBe("b");
    });

    it("works without the Signature prefix", () => {
      const header =
        'keyId="a|b|ed25519",algorithm="ed25519",' +
        'created="1",expires="2",headers="h",signature="sig"';
      const parsed = parseAuthHeader(header);
      expect(parsed.subscriberId).toBe("a");
      expect(parsed.uniqueKeyId).toBe("b");
      expect(parsed.algorithm).toBe("ed25519");
    });

    it("returns empty strings for missing fields", () => {
      const parsed = parseAuthHeader("");
      expect(parsed.keyId).toBe("");
      expect(parsed.algorithm).toBe("");
      expect(parsed.created).toBe("");
      expect(parsed.expires).toBe("");
      expect(parsed.headers).toBe("");
      expect(parsed.signature).toBe("");
      expect(parsed.subscriberId).toBe("");
      expect(parsed.uniqueKeyId).toBe("");
    });

    it("correctly parses a header built by buildAuthHeader()", () => {
      const kp = generateKeyPair();
      const header = buildAuthHeader({
        subscriberId: "test.ondc.org",
        uniqueKeyId: "key-42",
        privateKey: kp.privateKey,
        body: { action: "search" },
      });
      const parsed = parseAuthHeader(header);
      expect(parsed.subscriberId).toBe("test.ondc.org");
      expect(parsed.uniqueKeyId).toBe("key-42");
      expect(parsed.algorithm).toBe("ed25519");
      expect(parsed.headers).toBe("(created) (expires) digest");
      expect(parsed.keyId).toBe("test.ondc.org|key-42|ed25519");
      expect(parsed.signature.length).toBeGreaterThan(0);
      expect(parsed.created.length).toBeGreaterThan(0);
      expect(parsed.expires.length).toBeGreaterThan(0);
    });

    it("handles keyId with only subscriberId (no pipe separators)", () => {
      const header = 'keyId="justsubscriber",algorithm="ed25519",created="1",expires="2",headers="h",signature="s"';
      const parsed = parseAuthHeader(header);
      expect(parsed.subscriberId).toBe("justsubscriber");
      expect(parsed.uniqueKeyId).toBe("");
    });
  });

  describe("verifyAuthHeader()", () => {
    it("returns true for a valid header+body+key combination", () => {
      const kp = generateKeyPair();
      const body = { context: { domain: "retail" }, message: { intent: {} } };
      const header = buildAuthHeader({
        subscriberId: "verifier.com",
        uniqueKeyId: "k1",
        privateKey: kp.privateKey,
        body,
      });
      const result = verifyAuthHeader({
        header,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(true);
    });

    it("returns false for an expired header", () => {
      const kp = generateKeyPair();
      const body = { test: "expired" };

      // Build a header with timestamps in the past
      const pastTime = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const expiredHeader =
        `Signature keyId="sub|key|ed25519",` +
        `algorithm="ed25519",` +
        `created="${pastTime}",` +
        `expires="${pastTime + 300}",` + // expired 5 minutes ago
        `headers="(created) (expires) digest",` +
        `signature="dGVzdA=="`;

      const result = verifyAuthHeader({
        header: expiredHeader,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false when the body has been tampered with", () => {
      const kp = generateKeyPair();
      const originalBody = { value: "original" };
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body: originalBody,
      });
      const tamperedBody = { value: "tampered" };
      const result = verifyAuthHeader({
        header,
        body: tamperedBody,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false when verified with a wrong public key", () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const body = { data: "signed by kp1" };
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp1.privateKey,
        body,
      });
      const result = verifyAuthHeader({
        header,
        body,
        publicKey: kp2.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false for a completely malformed header", () => {
      const kp = generateKeyPair();
      const result = verifyAuthHeader({
        header: "not a valid header at all",
        body: {},
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false when created timestamp is far in the future", () => {
      const kp = generateKeyPair();
      const body = { test: "future" };

      // Build a header with timestamps far in the future (beyond the 30s tolerance)
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const futureHeader =
        `Signature keyId="sub|key|ed25519",` +
        `algorithm="ed25519",` +
        `created="${futureTime}",` +
        `expires="${futureTime + 300}",` +
        `headers="(created) (expires) digest",` +
        `signature="dGVzdA=="`;

      const result = verifyAuthHeader({
        header: futureHeader,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false when the signature is corrupted", () => {
      const kp = generateKeyPair();
      const body = { important: "data" };
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body,
      });
      // Replace the signature value with a corrupted one
      const corrupted = header.replace(/signature="[^"]*"/, 'signature="AAAA/corrupted+sig=="');
      const result = verifyAuthHeader({
        header: corrupted,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });

    it("returns false when expires is not a valid number", () => {
      const kp = generateKeyPair();
      const body = {};
      const header =
        `Signature keyId="sub|key|ed25519",` +
        `algorithm="ed25519",` +
        `created="1700000000",` +
        `expires="not-a-number",` +
        `headers="(created) (expires) digest",` +
        `signature="dGVzdA=="`;
      const result = verifyAuthHeader({
        header,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(false);
    });
  });

  describe("buildGatewayAuthHeader()", () => {
    it("returns the same format as buildAuthHeader()", () => {
      const kp = generateKeyPair();
      const params = {
        subscriberId: "gateway.ondc.org",
        uniqueKeyId: "gw-key",
        privateKey: kp.privateKey,
        body: { context: {} },
      };
      const gwHeader = buildGatewayAuthHeader(params);
      expect(gwHeader.startsWith("Signature ")).toBe(true);
      expect(gwHeader).toContain('keyId="gateway.ondc.org|gw-key|ed25519"');
      expect(gwHeader).toContain('algorithm="ed25519"');
    });

    it("produces a verifiable header", () => {
      const kp = generateKeyPair();
      const body = { gateway: "request" };
      const header = buildGatewayAuthHeader({
        subscriberId: "gw",
        uniqueKeyId: "k",
        privateKey: kp.privateKey,
        body,
      });
      const result = verifyAuthHeader({
        header,
        body,
        publicKey: kp.publicKey,
      });
      expect(result).toBe(true);
    });

    it("is functionally identical to buildAuthHeader()", () => {
      const kp = generateKeyPair();
      const body = { test: "identical" };
      const params = {
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body,
      };

      // Since both use Date.now(), we mock it to get identical timestamps
      const fixedNow = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(fixedNow);

      const authHeader = buildAuthHeader(params);
      const gwHeader = buildGatewayAuthHeader(params);
      expect(authHeader).toBe(gwHeader);
    });
  });

  describe("round-trip build + verify", () => {
    it("verifies a freshly built header", () => {
      const kp = generateKeyPair();
      const body = { action: "search", domain: "retail" };
      const header = buildAuthHeader({
        subscriberId: "round-trip.com",
        uniqueKeyId: "rt-key",
        privateKey: kp.privateKey,
        body,
      });
      expect(
        verifyAuthHeader({ header, body, publicKey: kp.publicKey }),
      ).toBe(true);
    });

    it("verifies with the exact same body object", () => {
      const kp = generateKeyPair();
      const body = {
        context: { domain: "nic2004:52110", action: "search", core_version: "1.0.0" },
        message: { intent: { item: { descriptor: { name: "laptop" } } } },
      };
      const header = buildAuthHeader({
        subscriberId: "buyer-app.com",
        uniqueKeyId: "ba-key-1",
        privateKey: kp.privateKey,
        body,
      });
      expect(
        verifyAuthHeader({ header, body, publicKey: kp.publicKey }),
      ).toBe(true);
    });

    it("verifies with a structurally identical body (new reference)", () => {
      const kp = generateKeyPair();
      const body1 = { key: "value", nested: { a: 1 } };
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body: body1,
      });
      // Create a new object with the same structure
      const body2 = JSON.parse(JSON.stringify(body1)) as typeof body1;
      expect(
        verifyAuthHeader({ header, body: body2, publicKey: kp.publicKey }),
      ).toBe(true);
    });

    it("fails verification when even one field in the body changes", () => {
      const kp = generateKeyPair();
      const body = { context: { domain: "retail" }, message: { count: 5 } };
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body,
      });
      const alteredBody = { context: { domain: "retail" }, message: { count: 6 } };
      expect(
        verifyAuthHeader({ header, body: alteredBody, publicKey: kp.publicKey }),
      ).toBe(false);
    });

    it("round-trips with an empty body", () => {
      const kp = generateKeyPair();
      const body = {};
      const header = buildAuthHeader({
        subscriberId: "sub",
        uniqueKeyId: "key",
        privateKey: kp.privateKey,
        body,
      });
      expect(
        verifyAuthHeader({ header, body, publicKey: kp.publicKey }),
      ).toBe(true);
    });

    it("round-trips via gateway auth header", () => {
      const kp = generateKeyPair();
      const body = { gateway: true, payload: [1, 2, 3] };
      const header = buildGatewayAuthHeader({
        subscriberId: "gw.ondc.org",
        uniqueKeyId: "gw-signing-key",
        privateKey: kp.privateKey,
        body,
      });
      expect(
        verifyAuthHeader({ header, body, publicKey: kp.publicKey }),
      ).toBe(true);
    });

    it("works end-to-end: generate keys, build, parse, verify", () => {
      const kp = generateKeyPair();
      const body = { context: { transaction_id: "txn-123" }, message: {} };
      const subscriberId = "e2e-subscriber.ondc.org";
      const uniqueKeyId = "e2e-key-99";

      // Build
      const header = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: kp.privateKey,
        body,
      });

      // Parse
      const parsed = parseAuthHeader(header);
      expect(parsed.subscriberId).toBe(subscriberId);
      expect(parsed.uniqueKeyId).toBe(uniqueKeyId);
      expect(parsed.algorithm).toBe("ed25519");

      // Verify
      expect(
        verifyAuthHeader({ header, body, publicKey: kp.publicKey }),
      ).toBe(true);
    });
  });
});
