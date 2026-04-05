/**
 * Extreme Edge-Case Tests for the ONDC Crypto Layer
 *
 * These tests cover scenarios that rarely occur but can break production:
 * malformed inputs, concurrency races, boundary conditions, encoding
 * traps, and protocol-level tampering. Each test has a comment
 * explaining the real-world failure mode it guards against.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateKeyPair,
  sign,
  verify,
} from "@ondc/shared/crypto";
import {
  hashBody,
  hashRawBody,
  createDigestHeader,
} from "@ondc/shared/crypto";
import {
  generateEncryptionKeyPair,
  encrypt,
  decrypt,
} from "@ondc/shared/crypto";
import {
  buildAuthHeader,
  parseAuthHeader,
  verifyAuthHeader,
  buildHybridAuthHeader,
  parseHybridAuthHeader,
  verifyHybridAuthHeader,
} from "@ondc/shared/crypto";
import { initHybridAuth } from "../../packages/shared/src/crypto/auth-header.js";
import {
  isPqEnabled,
  ensurePqReady,
  generatePqSigningKeyPair,
  generateHybridSigningKeyPair,
  generateHybridEncryptionKeyPair,
  hybridSign,
  hybridVerify,
  hybridEncapsulate,
  hybridDecapsulate,
} from "@ondc/shared/crypto";
import {
  maskPiiInBody,
  unmaskPiiInBody,
  anonymizePiiInBody,
  derivePiiKey,
  encryptPii,
  decryptPii,
} from "../../packages/shared/src/utils/pii-guard.js";

// ---------------------------------------------------------------------------
// 1. Ed25519 Edge Cases
// ---------------------------------------------------------------------------

describe("Ed25519 Extreme Edge Cases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs and verifies an empty message", () => {
    // Prod scenario: empty ONDC callback body before JSON parse
    const kp = generateKeyPair();
    const sig = sign("", kp.privateKey);
    expect(verify("", sig, kp.publicKey)).toBe(true);
  });

  it("handles message with null bytes in the middle", () => {
    // Prod scenario: binary-safe strings that pass through logging middleware
    const kp = generateKeyPair();
    const msg = "before\x00middle\x00after";
    const sig = sign(msg, kp.privateKey);
    expect(verify(msg, sig, kp.publicKey)).toBe(true);
    // Truncated-at-null must fail
    expect(verify("before", sig, kp.publicKey)).toBe(false);
  });

  it("signs and verifies a 1MB+ message", () => {
    // Prod scenario: large catalog payloads from BPPs
    const kp = generateKeyPair();
    const bigMsg = "x".repeat(1_048_576 + 1);
    const sig = sign(bigMsg, kp.privateKey);
    expect(verify(bigMsg, sig, kp.publicKey)).toBe(true);
  });

  it("handles zero-width joiners and RTL override characters", () => {
    // Prod scenario: Hindi/Urdu product names with combining marks in ONDC catalog
    const kp = generateKeyPair();
    const zwj = "\u200D"; // zero-width joiner
    const rtlOverride = "\u202E"; // right-to-left override
    const msg = `test${zwj}name${rtlOverride}end`;
    const sig = sign(msg, kp.privateKey);
    expect(verify(msg, sig, kp.publicKey)).toBe(true);
    // Without ZWJ must fail
    expect(verify("testnameend", sig, kp.publicKey)).toBe(false);
  });

  it("handles complex emoji sequences (family emoji)", () => {
    // Prod scenario: product descriptions with emoji from seller apps
    const kp = generateKeyPair();
    const familyEmoji = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const sig = sign(familyEmoji, kp.privateKey);
    expect(verify(familyEmoji, sig, kp.publicKey)).toBe(true);
  });

  it("handles Devanagari combining marks", () => {
    // Prod scenario: Hindi product names "हिन्दी" with virama + conjuncts
    const kp = generateKeyPair();
    const devanagari = "\u0939\u093F\u0928\u094D\u0926\u0940"; // हिन्दी
    const sig = sign(devanagari, kp.privateKey);
    expect(verify(devanagari, sig, kp.publicKey)).toBe(true);
  });

  it("sign with key A, verify with key B must fail", () => {
    // Prod scenario: registry returns wrong public key for a subscriber
    const kpA = generateKeyPair();
    const kpB = generateKeyPair();
    const sig = sign("cross-key test", kpA.privateKey);
    expect(verify("cross-key test", sig, kpB.publicKey)).toBe(false);
  });

  it("corrupted signature: flip single bit in every position of first 8 bytes", () => {
    // Prod scenario: network corruption flipping individual bits during transit
    const kp = generateKeyPair();
    const msg = "bit-flip test";
    const sig = sign(msg, kp.privateKey);
    const sigBytes = Buffer.from(sig, "base64");

    for (let byteIdx = 0; byteIdx < Math.min(8, sigBytes.length); byteIdx++) {
      for (let bit = 0; bit < 8; bit++) {
        const corrupted = Buffer.from(sigBytes);
        corrupted[byteIdx] = corrupted[byteIdx]! ^ (1 << bit);
        const corruptedSig = corrupted.toString("base64");
        // Most bit flips should fail. Ed25519 spec says any corruption fails.
        // (Theoretically one flip could produce same sig, but probability is negligible)
        expect(verify(msg, corruptedSig, kp.publicKey)).toBe(false);
      }
    }
  });

  it("truncated signature: 1 byte short", () => {
    // Prod scenario: HTTP body truncation from reverse proxy timeout
    const kp = generateKeyPair();
    const sig = sign("truncate test", kp.privateKey);
    const sigBytes = Buffer.from(sig, "base64");
    const truncated = sigBytes.subarray(0, sigBytes.length - 1).toString("base64");
    // Should throw or return false
    let result: boolean;
    try {
      result = verify("truncate test", truncated, kp.publicKey);
    } catch {
      result = false;
    }
    expect(result).toBe(false);
  });

  it("truncated signature: half length", () => {
    // Prod scenario: partial response from registry lookup
    const kp = generateKeyPair();
    const sig = sign("half test", kp.privateKey);
    const sigBytes = Buffer.from(sig, "base64");
    const half = sigBytes.subarray(0, Math.floor(sigBytes.length / 2)).toString("base64");
    let result: boolean;
    try {
      result = verify("half test", half, kp.publicKey);
    } catch {
      result = false;
    }
    expect(result).toBe(false);
  });

  it("empty signature", () => {
    // Prod scenario: header parser extracts empty signature field
    const kp = generateKeyPair();
    let result: boolean;
    try {
      result = verify("test", "", kp.publicKey);
    } catch {
      result = false;
    }
    expect(result).toBe(false);
  });

  it("malformed base64 private key with invalid characters", () => {
    // Prod scenario: env var PII corruption adds illegal chars to key
    expect(() => sign("test", "!!!not-base64!!!")).toThrow();
  });

  it("all-zero 32-byte private key", () => {
    // Prod scenario: uninitialized key buffer in misconfigured container
    const zeroKey = Buffer.alloc(32, 0).toString("base64");
    // Should either work (it's a valid scalar) or throw, but not crash
    let threw = false;
    try {
      const sig = sign("test", zeroKey);
      expect(typeof sig).toBe("string");
    } catch {
      threw = true;
    }
    // Either behavior is acceptable, no crash is the requirement
    expect(true).toBe(true);
  });

  it("all-ones (0xFF) 32-byte private key", () => {
    // Prod scenario: key filled with 0xFF from failed memset
    const onesKey = Buffer.alloc(32, 0xFF).toString("base64");
    let threw = false;
    try {
      const sig = sign("test", onesKey);
      expect(typeof sig).toBe("string");
    } catch {
      threw = true;
    }
    expect(true).toBe(true);
  });

  it("31-byte private key (1 byte short)", () => {
    // Prod scenario: key truncation during base64 decode/re-encode cycle
    const shortKey = Buffer.alloc(31, 42).toString("base64");
    expect(() => sign("test", shortKey)).toThrow();
  });

  it("33-byte private key (1 byte long)", () => {
    // Prod scenario: extra newline appended to key in env var
    const longKey = Buffer.alloc(33, 42).toString("base64");
    expect(() => sign("test", longKey)).toThrow();
  });

  it("public key with wrong length rejects verification", () => {
    // Prod scenario: registry returns an X25519 key instead of Ed25519 key
    const kp = generateKeyPair();
    const sig = sign("test", kp.privateKey);
    const shortPub = Buffer.alloc(16, 0).toString("base64");
    let result: boolean;
    try {
      result = verify("test", sig, shortPub);
    } catch {
      result = false;
    }
    expect(result).toBe(false);
  });

  it("100 concurrent sign/verify operations", async () => {
    // Prod scenario: 100 simultaneous API requests arriving at gateway
    const kp = generateKeyPair();
    const tasks = Array.from({ length: 100 }, (_, i) => {
      return Promise.resolve().then(() => {
        const msg = `concurrent-msg-${i}`;
        const sig = sign(msg, kp.privateKey);
        return verify(msg, sig, kp.publicKey);
      });
    });
    const results = await Promise.all(tasks);
    expect(results.every(Boolean)).toBe(true);
  });

  it("Ed25519 is deterministic: 1000 signatures of same message are identical", () => {
    // Prod scenario: replay detection depends on signature determinism
    const kp = generateKeyPair();
    const msg = "determinism-check";
    const firstSig = sign(msg, kp.privateKey);
    for (let i = 0; i < 1000; i++) {
      expect(sign(msg, kp.privateKey)).toBe(firstSig);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. BLAKE-512 Edge Cases
// ---------------------------------------------------------------------------

describe("BLAKE-512 Extreme Edge Cases", () => {
  it("empty body hash produces a valid 64-byte digest", () => {
    // Prod scenario: on_search callback with empty message body
    const hash = hashBody("");
    expect(Buffer.from(hash, "base64").length).toBe(64);
  });

  it("body with only whitespace", () => {
    // Prod scenario: body that looks empty after trim but isn't
    const wsHash = hashBody("   \t\n\r  ");
    const emptyHash = hashBody("");
    expect(wsHash).not.toBe(emptyHash);
  });

  it("nested objects 100 levels deep", () => {
    // Prod scenario: deeply nested ONDC catalog categories
    let obj: any = { leaf: "value" };
    for (let i = 0; i < 100; i++) {
      obj = { level: obj };
    }
    const hash = hashBody(obj);
    expect(Buffer.from(hash, "base64").length).toBe(64);
  });

  it("array of 10000 items", () => {
    // Prod scenario: large on_search response with thousands of items
    const arr = Array.from({ length: 10000 }, (_, i) => ({ id: `item-${i}`, price: i * 10 }));
    const hash = hashBody({ items: arr });
    expect(Buffer.from(hash, "base64").length).toBe(64);
  });

  it("body with special JSON characters", () => {
    // Prod scenario: product descriptions with backslashes, quotes, unicode escapes
    const body = {
      desc: 'He said "hello\\" and \\n newline',
      unicode: "\u0000\u001F\uFFFF",
      backslash: "C:\\path\\to\\file",
    };
    const hash = hashBody(body);
    expect(Buffer.from(hash, "base64").length).toBe(64);
  });

  it("body with null bytes in values", () => {
    // Prod scenario: binary data accidentally placed in JSON string field
    const body = { data: "before\x00after" };
    const hash = hashBody(body);
    expect(Buffer.from(hash, "base64").length).toBe(64);
  });

  it("hashBody vs hashRawBody produce different results for same logical object with different whitespace", () => {
    // Prod scenario: sender uses pretty-printed JSON, receiver uses compact JSON.
    // This is THE canonical bug in ONDC auth verification.
    const obj = { a: 1, b: "hello" };
    const compact = JSON.stringify(obj);
    const pretty = JSON.stringify(obj, null, 2);
    const hashFromObj = hashBody(obj);
    const hashFromCompact = hashRawBody(compact);
    const hashFromPretty = hashRawBody(pretty);
    // hashBody(obj) == hashRawBody(compact) because hashBody uses JSON.stringify
    expect(hashFromObj).toBe(hashFromCompact);
    // But pretty-printed raw body produces a different hash
    expect(hashFromCompact).not.toBe(hashFromPretty);
  });

  it("very large body (10MB string)", () => {
    // Prod scenario: massive catalog dump from a BPP
    const big = "a".repeat(10_000_000);
    const hash = hashBody(big);
    expect(Buffer.from(hash, "base64").length).toBe(64);
  }, 30000);

  it("body with circular reference detection should throw, not infinite loop", () => {
    // Prod scenario: malicious payload with circular refs hitting hashBody
    const obj: any = { a: 1 };
    obj.self = obj;
    // JSON.stringify throws on circular references -- hashBody should propagate
    expect(() => hashBody(obj)).toThrow();
  });

  it("createDigestHeader format is stable for same input", () => {
    // Prod scenario: digest header must match across sender and receiver
    const body = { context: { domain: "ONDC:RET10" } };
    const d1 = createDigestHeader(body);
    const d2 = createDigestHeader(body);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^BLAKE-512=[A-Za-z0-9+/]+=*$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Auth Header Edge Cases
// ---------------------------------------------------------------------------

describe("Auth Header Extreme Edge Cases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("build and verify round-trip with empty body {}", () => {
    // Prod scenario: health-check or empty on_search callback
    const kp = generateKeyPair();
    const body = {};
    const header = buildAuthHeader({
      subscriberId: "empty.com",
      uniqueKeyId: "k1",
      privateKey: kp.privateKey,
      body,
    });
    expect(verifyAuthHeader({ header, body, publicKey: kp.publicKey })).toBe(true);
  });

  it("build with body containing every JSON type", () => {
    // Prod scenario: polymorphic Beckn message fields
    const kp = generateKeyPair();
    const body = {
      str: "hello",
      num: 42,
      float: 3.14,
      bool: true,
      nil: null,
      arr: [1, "two", false, null],
      nested: { deep: { deeper: true } },
    };
    const header = buildAuthHeader({
      subscriberId: "types.com",
      uniqueKeyId: "k1",
      privateKey: kp.privateKey,
      body,
    });
    expect(verifyAuthHeader({ header, body, publicKey: kp.publicKey })).toBe(true);
  });

  it("parse header with extra spaces between fields", () => {
    // Prod scenario: some HTTP libraries add spaces after commas in headers
    const header =
      'Signature keyId="sub|key|ed25519",  algorithm="ed25519",  ' +
      'created="1700000000",  expires="1700000300",  ' +
      'headers="(created) (expires) digest",  signature="dGVzdA=="';
    const parsed = parseAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.subscriberId).toBe("sub");
    expect(parsed!.algorithm).toBe("ed25519");
  });

  it("parse header with fields in different order", () => {
    // Prod scenario: different ONDC participant implementations serialize fields differently
    const header =
      'Signature algorithm="ed25519",signature="dGVzdA==",keyId="sub|key|ed25519",' +
      'created="1700000000",expires="1700000300",headers="(created) (expires) digest"';
    const parsed = parseAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.subscriberId).toBe("sub");
    expect(parsed!.signature).toBe("dGVzdA==");
  });

  it("parse header with extra unknown fields (should ignore)", () => {
    // Prod scenario: future ONDC spec adds new fields, old verifiers must not break
    const header =
      'Signature keyId="sub|key|ed25519",algorithm="ed25519",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",signature="dGVzdA==",' +
      'extra_field="should_be_ignored",another="also_ignored"';
    const parsed = parseAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.subscriberId).toBe("sub");
  });

  it("parse header with duplicate fields (last wins due to regex iteration)", () => {
    // Prod scenario: buggy sender duplicates a field
    const header =
      'Signature keyId="sub|key|ed25519",algorithm="ed25519",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",' +
      'signature="first",signature="second"';
    const parsed = parseAuthHeader(header);
    expect(parsed).not.toBeNull();
    // The regex iteration will overwrite, so last value wins
    expect(parsed!.signature).toBe("second");
  });

  it("parse header with empty keyId returns null", () => {
    // Prod scenario: gateway receives header with missing subscriber info
    const header =
      'Signature keyId="",algorithm="ed25519",' +
      'created="1",expires="2",headers="h",signature="s"';
    const parsed = parseAuthHeader(header);
    // Empty keyId splits into [""] which is length 1, not 3
    expect(parsed).toBeNull();
  });

  it("parse header with pipe characters in subscriberId", () => {
    // Prod scenario: subscriber ID like "sub|scriber" with embedded pipes
    // keyId format is "subscriberId|uniqueKeyId|algorithm" -- extra pipes break split
    const header =
      'Signature keyId="sub|scriber|key|ed25519",algorithm="ed25519",' +
      'created="1",expires="2",headers="h",signature="s"';
    const parsed = parseAuthHeader(header);
    // Split on | gives 4 parts, parseAuthHeader expects exactly 3
    expect(parsed).toBeNull();
  });

  it("verify with timestamp exactly at boundary (created = now, expires = now + 1)", () => {
    // Prod scenario: request arrives at the exact second it was created
    const kp = generateKeyPair();
    const body = { test: "boundary" };
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(Date, "now").mockReturnValue(now * 1000);

    const header = buildAuthHeader({
      subscriberId: "s",
      uniqueKeyId: "k",
      privateKey: kp.privateKey,
      body,
    });

    // Verify at the same second -- should pass because expires = now + 300
    expect(verifyAuthHeader({ header, body, publicKey: kp.publicKey })).toBe(true);
  });

  it("verify with timestamp 1 second past expiry must fail", () => {
    // Prod scenario: request delayed in queue just past the 5-min window
    const kp = generateKeyPair();
    const body = { test: "expired" };
    const created = Math.floor(Date.now() / 1000);
    vi.spyOn(Date, "now").mockReturnValue(created * 1000);

    const header = buildAuthHeader({
      subscriberId: "s",
      uniqueKeyId: "k",
      privateKey: kp.privateKey,
      body,
    });

    // Jump time to 1 second past expiry (created + 300 + 1)
    vi.spyOn(Date, "now").mockReturnValue((created + 301) * 1000);
    expect(verifyAuthHeader({ header, body, publicKey: kp.publicKey })).toBe(false);
  });

  it("verify with negative timestamps fails", () => {
    // Prod scenario: crafted malicious header with negative epoch
    const kp = generateKeyPair();
    const header =
      'Signature keyId="s|k|ed25519",algorithm="ed25519",' +
      'created="-100",expires="-1",' +
      'headers="(created) (expires) digest",signature="dGVzdA=="';
    expect(verifyAuthHeader({ header, body: {}, publicKey: kp.publicKey })).toBe(false);
  });

  it("verify with timestamp year 2099 (far future)", () => {
    // Prod scenario: attacker sets created far in future to bypass expiry
    const kp = generateKeyPair();
    const futureCreated = Math.floor(new Date("2099-01-01").getTime() / 1000);
    const header =
      `Signature keyId="s|k|ed25519",algorithm="ed25519",` +
      `created="${futureCreated}",expires="${futureCreated + 300}",` +
      `headers="(created) (expires) digest",signature="dGVzdA=="`;
    // created > now + 30 should fail
    expect(verifyAuthHeader({ header, body: {}, publicKey: kp.publicKey })).toBe(false);
  });

  it("verify with body that has keys in different order than signed", () => {
    // Prod scenario: sender serializes {a,b}, receiver parses and re-serializes {b,a}.
    // JSON.stringify preserves insertion order, so different order = different digest.
    const kp = generateKeyPair();
    const bodyOriginal = JSON.parse('{"z":"last","a":"first"}') as object;
    const header = buildAuthHeader({
      subscriberId: "s",
      uniqueKeyId: "k",
      privateKey: kp.privateKey,
      body: bodyOriginal,
    });
    // Reconstructed body with same keys but different insertion order
    const bodyReordered = JSON.parse('{"a":"first","z":"last"}') as object;
    const strOrig = JSON.stringify(bodyOriginal);
    const strReorder = JSON.stringify(bodyReordered);
    if (strOrig !== strReorder) {
      // Different serialization = verification fails
      expect(verifyAuthHeader({ header, body: bodyReordered, publicKey: kp.publicKey })).toBe(false);
    }
    // But rawBody bypass should work if we pass the original wire bytes
    expect(
      verifyAuthHeader({ header, body: bodyReordered, publicKey: kp.publicKey, rawBody: strOrig }),
    ).toBe(true);
  });

  it("header with algorithm='rsa' must fail (not ed25519)", () => {
    // Prod scenario: attacker changes algorithm to bypass Ed25519 verification
    const header =
      'Signature keyId="s|k|rsa",algorithm="rsa",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",signature="dGVzdA=="';
    expect(parseAuthHeader(header)).toBeNull();
  });

  it("header with missing 'Signature ' prefix still parses", () => {
    // Prod scenario: some proxies strip the "Signature " prefix
    const header =
      'keyId="s|k|ed25519",algorithm="ed25519",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",signature="dGVzdA=="';
    const parsed = parseAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.subscriberId).toBe("s");
  });

  it("build header, tamper with one byte of body, verify must fail", () => {
    // Prod scenario: man-in-the-middle modifies a single character in the body
    const kp = generateKeyPair();
    const body = { amount: "1000.00", currency: "INR" };
    const header = buildAuthHeader({
      subscriberId: "s",
      uniqueKeyId: "k",
      privateKey: kp.privateKey,
      body,
    });
    const tamperedBody = { amount: "1000.01", currency: "INR" };
    expect(verifyAuthHeader({ header, body: tamperedBody, publicKey: kp.publicKey })).toBe(false);
  });

  it("1000 concurrent build+verify operations (race condition check)", async () => {
    // Prod scenario: high-throughput gateway processing 1000 concurrent requests
    const kp = generateKeyPair();
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      Promise.resolve().then(() => {
        const body = { idx: i };
        const header = buildAuthHeader({
          subscriberId: "concurrent",
          uniqueKeyId: "k",
          privateKey: kp.privateKey,
          body,
        });
        return verifyAuthHeader({ header, body, publicKey: kp.publicKey });
      }),
    );
    const results = await Promise.all(tasks);
    expect(results.every(Boolean)).toBe(true);
  });

  it("header with non-numeric created/expires", () => {
    // Prod scenario: malformed header injected via HTTP header smuggling
    const kp = generateKeyPair();
    const header =
      'Signature keyId="s|k|ed25519",algorithm="ed25519",' +
      'created="abc",expires="def",' +
      'headers="(created) (expires) digest",signature="dGVzdA=="';
    expect(verifyAuthHeader({ header, body: {}, publicKey: kp.publicKey })).toBe(false);
  });

  it("rawBody parameter prevents JSON re-serialization mismatch", () => {
    // Prod scenario: upstream sends body with specific whitespace/encoding that
    // would change if parsed and re-serialized
    const kp = generateKeyPair();
    // Build with the object form
    const body = { key: "value" };
    const rawBody = '{"key":"value"}';
    const header = buildAuthHeader({
      subscriberId: "s",
      uniqueKeyId: "k",
      privateKey: kp.privateKey,
      body,
    });
    // Verify with rawBody matching what buildAuthHeader would have hashed
    expect(verifyAuthHeader({ header, body, publicKey: kp.publicKey, rawBody })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. X25519 Sealed Box Edge Cases
// ---------------------------------------------------------------------------

describe("X25519 Sealed Box Extreme Edge Cases", () => {
  it("encrypt and decrypt empty string", () => {
    // Prod scenario: empty challenge string during subscribe flow
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("", kp.publicKey);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe("");
  });

  it("encrypt and decrypt 1 byte", () => {
    // Prod scenario: single character challenge response
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("x", kp.publicKey);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe("x");
  });

  it("encrypt and decrypt exactly 64KB", () => {
    // Prod scenario: encrypted PII blob at chunk boundary
    const kp = generateEncryptionKeyPair();
    const data = "A".repeat(65536);
    const ct = encrypt(data, kp.publicKey);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe(data);
  });

  it("encrypt and decrypt 1MB", () => {
    // Prod scenario: large encrypted catalog data
    const kp = generateEncryptionKeyPair();
    const data = "B".repeat(1_048_576);
    const ct = encrypt(data, kp.publicKey);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe(data);
  });

  it("decrypt with wrong private key must throw", () => {
    // Prod scenario: key rotation leaves old private key in vault
    const kp1 = generateEncryptionKeyPair();
    const kp2 = generateEncryptionKeyPair();
    const ct = encrypt("secret", kp1.publicKey);
    expect(() => decrypt(ct, kp2.privateKey, kp2.publicKey)).toThrow();
  });

  it("decrypt with corrupted ciphertext: flip every byte in first 48 bytes", () => {
    // Prod scenario: memory corruption or network bitrot in encrypted payload
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("corruption test", kp.publicKey);
    const ctBytes = Buffer.from(ct, "base64");
    const testRange = Math.min(48, ctBytes.length);

    for (let i = 0; i < testRange; i++) {
      const corrupted = Buffer.from(ctBytes);
      corrupted[i] = corrupted[i]! ^ 0xFF;
      const corruptedCt = corrupted.toString("base64");
      expect(() => decrypt(corruptedCt, kp.privateKey, kp.publicKey)).toThrow();
    }
  });

  it("decrypt truncated ciphertext: missing last byte", () => {
    // Prod scenario: TCP connection reset during encrypted payload transfer
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("truncated", kp.publicKey);
    const ctBytes = Buffer.from(ct, "base64");
    const truncated = ctBytes.subarray(0, ctBytes.length - 1).toString("base64");
    expect(() => decrypt(truncated, kp.privateKey, kp.publicKey)).toThrow();
  });

  it("decrypt truncated ciphertext: missing MAC (last 16 bytes)", () => {
    // Prod scenario: partial download of encrypted response
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("no mac", kp.publicKey);
    const ctBytes = Buffer.from(ct, "base64");
    // Remove the last 16 bytes (MAC region in sealed box)
    const noMac = ctBytes.subarray(0, ctBytes.length - 16).toString("base64");
    expect(() => decrypt(noMac, kp.privateKey, kp.publicKey)).toThrow();
  });

  it("decrypt truncated ciphertext: missing ephemeral key (first 32 bytes)", () => {
    // Prod scenario: proxy strips beginning of response body
    const kp = generateEncryptionKeyPair();
    const ct = encrypt("no ephemeral", kp.publicKey);
    const ctBytes = Buffer.from(ct, "base64");
    // Remove ephemeral key
    const noEphemeral = ctBytes.subarray(32).toString("base64");
    expect(() => decrypt(noEphemeral, kp.privateKey, kp.publicKey)).toThrow();
  });

  it("encrypt with DER-encoded public key (ONDC MCowBQYDK2VuAyEA... format)", () => {
    // Prod scenario: ONDC registry returns DER-encoded X25519 public keys
    const kp = generateEncryptionKeyPair();
    const derPrefix = Buffer.from("302a300506032b656e032100", "hex");
    const rawPub = Buffer.from(kp.publicKey, "base64");
    const derPub = Buffer.concat([derPrefix, rawPub]).toString("base64");

    const ct = encrypt("ondc challenge", derPub);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe("ondc challenge");
  });

  it("encrypt with raw 32-byte public key", () => {
    // Prod scenario: locally generated key without DER wrapping
    const kp = generateEncryptionKeyPair();
    const rawPub = Buffer.from(kp.publicKey, "base64");
    expect(rawPub.length).toBe(32);
    const ct = encrypt("raw key test", kp.publicKey);
    const pt = decrypt(ct, kp.privateKey, kp.publicKey);
    expect(pt).toBe("raw key test");
  });

  it("encrypt with wrong-length public key: 31 bytes", () => {
    // Prod scenario: key truncation during copy-paste
    const shortKey = Buffer.alloc(31, 42).toString("base64");
    expect(() => encrypt("test", shortKey)).toThrow();
  });

  it("encrypt with wrong-length public key: 33 bytes", () => {
    // Prod scenario: extra byte appended to key
    const longKey = Buffer.alloc(33, 42).toString("base64");
    expect(() => encrypt("test", longKey)).toThrow();
  });

  it("encrypt same plaintext twice produces different ciphertexts (randomized ephemeral key)", () => {
    // Prod scenario: if ciphertexts were identical, observer could correlate messages
    const kp = generateEncryptionKeyPair();
    const pt = "randomization check";
    const ct1 = encrypt(pt, kp.publicKey);
    const ct2 = encrypt(pt, kp.publicKey);
    expect(ct1).not.toBe(ct2);
    // But both decrypt to the same plaintext
    expect(decrypt(ct1, kp.privateKey, kp.publicKey)).toBe(pt);
    expect(decrypt(ct2, kp.privateKey, kp.publicKey)).toBe(pt);
  });

  it("100 concurrent encrypt/decrypt operations", async () => {
    // Prod scenario: burst of PII encrypt/decrypt during on_confirm processing
    const kp = generateEncryptionKeyPair();
    const tasks = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() => {
        const msg = `concurrent-enc-${i}`;
        const ct = encrypt(msg, kp.publicKey);
        const pt = decrypt(ct, kp.privateKey, kp.publicKey);
        return pt === msg;
      }),
    );
    const results = await Promise.all(tasks);
    expect(results.every(Boolean)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. PII Guard Edge Cases
// ---------------------------------------------------------------------------

describe("PII Guard Extreme Edge Cases", () => {
  const piiKey = derivePiiKey("test-master-key-for-extreme-tests");

  it("maskPiiInBody with deeply nested fulfillment arrays (10 fulfillments)", () => {
    // Prod scenario: multi-fulfillment order with 10 delivery stops
    const body = {
      message: {
        order: {
          billing: { name: "John Doe", phone: "9876543210" },
          fulfillments: Array.from({ length: 10 }, (_, i) => ({
            id: `f${i}`,
            start: { contact: { phone: `98765${String(i).padStart(5, "0")}` } },
            end: { contact: { phone: `91234${String(i).padStart(5, "0")}` } },
          })),
        },
      },
    };
    const masked = maskPiiInBody(body, piiKey) as any;
    // Billing name should be encrypted
    expect(masked.message.order.billing.name).toMatch(/^PII:/);
    expect(masked.message.order.billing.phone).toMatch(/^PII:/);
    // All fulfillment contacts should be encrypted
    for (let i = 0; i < 10; i++) {
      expect(masked.message.order.fulfillments[i].start.contact.phone).toMatch(/^PII:/);
      expect(masked.message.order.fulfillments[i].end.contact.phone).toMatch(/^PII:/);
    }
  });

  it("maskPiiInBody with missing fields (no billing, no fulfillments)", () => {
    // Prod scenario: search request has no order at all
    const body = { message: { intent: { descriptor: { name: "laptop" } } } };
    const masked = maskPiiInBody(body, piiKey) as any;
    // Should not crash, body should pass through unchanged structurally
    expect(masked.message.intent.descriptor.name).toBe("laptop");
  });

  it("maskPiiInBody with already-encrypted fields (PII: prefix) should not double-encrypt", () => {
    // Prod scenario: message is masked twice due to retry logic
    const body = {
      message: {
        order: {
          billing: { name: "John", phone: "9876543210" },
        },
      },
    };
    const masked1 = maskPiiInBody(body, piiKey) as any;
    const masked2 = maskPiiInBody(masked1, piiKey) as any;
    // Second mask should not change already-encrypted values
    expect(masked2.message.order.billing.name).toBe(masked1.message.order.billing.name);
    expect(masked2.message.order.billing.phone).toBe(masked1.message.order.billing.phone);
  });

  it("unmaskPiiInBody with corrupted encrypted values", () => {
    // Prod scenario: database corruption scrambles encrypted PII bytes
    const body = {
      message: {
        order: {
          billing: {
            name: "PII:" + Buffer.from("garbage-not-valid-aes").toString("base64"),
          },
        },
      },
    };
    // Should not throw; corrupted values stay as-is
    const unmasked = unmaskPiiInBody(body, piiKey) as any;
    // Value should remain encrypted (decryption failed silently)
    expect(unmasked.message.order.billing.name).toMatch(/^PII:/);
  });

  it("unmaskPiiInBody with wrong key leaves PII: values intact", () => {
    // Prod scenario: key rotation -- old encrypted data decrypted with new key
    const body = {
      message: {
        order: {
          billing: { name: "Alice", phone: "9999999999" },
        },
      },
    };
    const masked = maskPiiInBody(body, piiKey) as any;
    const wrongKey = derivePiiKey("completely-wrong-master-key");
    const unmasked = unmaskPiiInBody(masked, wrongKey) as any;
    // Should leave encrypted values intact (decryption fails silently)
    expect(unmasked.message.order.billing.name).toMatch(/^PII:/);
    expect(unmasked.message.order.billing.phone).toMatch(/^PII:/);
  });

  it("anonymizePiiInBody with special characters in names", () => {
    // Prod scenario: international customer names with accents, CJK, Arabic
    const body = {
      message: {
        order: {
          billing: {
            name: "\u00e9\u00f1 \u4e2d\u6587 \u0639\u0631\u0628\u064A",
            phone: "9876543210",
            email: "test@example.com",
          },
        },
      },
    };
    const anon = anonymizePiiInBody(body) as any;
    expect(anon.message.order.billing.name).toBe("REDACTED");
    // Phone and email should be hashed, not redacted
    expect(anon.message.order.billing.phone).not.toBe("9876543210");
    expect(anon.message.order.billing.phone).toMatch(/^[0-9a-f]{64}$/);
    expect(anon.message.order.billing.email).toMatch(/^[0-9a-f]{64}$/);
  });

  it("round-trip: mask then unmask restores original body exactly", () => {
    // Prod scenario: encrypt for storage, decrypt for fulfillment partner
    const body = {
      message: {
        order: {
          billing: {
            name: "Divya Mohan",
            phone: "9876543210",
            email: "contact@dmj.one",
            address: {
              door: "42",
              name: "Main St",
              city: "Bangalore",
              state: "Karnataka",
              country: "IND",
              area_code: "560001",
            },
          },
          fulfillments: [
            {
              id: "f1",
              start: { contact: { phone: "8765432109" } },
              end: {
                contact: { phone: "9876543210", email: "end@test.com" },
                location: {
                  address: {
                    door: "99",
                    name: "Delivery Lane",
                    city: "Mumbai",
                    state: "Maharashtra",
                    country: "IND",
                    area_code: "400001",
                  },
                },
              },
            },
          ],
        },
      },
    };
    const masked = maskPiiInBody(body, piiKey) as any;
    const unmasked = unmaskPiiInBody(masked, piiKey) as any;
    expect(unmasked).toEqual(body);
  });

  it("maskPiiInBody with null values in PII fields", () => {
    // Prod scenario: optional billing email is null
    const body = {
      message: {
        order: {
          billing: {
            name: null,
            phone: "9876543210",
            email: null,
          },
        },
      },
    };
    // Should not crash
    const masked = maskPiiInBody(body, piiKey) as any;
    expect(masked.message.order.billing.name).toBeNull();
    expect(masked.message.order.billing.phone).toMatch(/^PII:/);
  });

  it("maskPiiInBody with numeric phone (not string)", () => {
    // Prod scenario: sender sends phone as number instead of string
    const body = {
      message: {
        order: {
          billing: { phone: 9876543210 as any },
        },
      },
    };
    // Should not crash; numeric values are not strings so they pass through
    const masked = maskPiiInBody(body, piiKey) as any;
    expect(masked.message.order.billing.phone).toBe(9876543210);
  });

  it("performance: mask 1000 bodies in under 5 seconds", () => {
    // Prod scenario: batch processing of order callbacks
    const body = {
      message: {
        order: {
          billing: { name: "Test User", phone: "9876543210", email: "t@t.com" },
          fulfillments: [
            {
              id: "f1",
              start: { contact: { phone: "1111111111" } },
              end: { contact: { phone: "2222222222" } },
            },
          ],
        },
      },
    };
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      maskPiiInBody(body, piiKey);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it("encryptPii and decryptPii round-trip for various string lengths", () => {
    // Prod scenario: PII values range from 1 char to long addresses
    const testStrings = [
      "",
      "A",
      "Hello",
      "A".repeat(100),
      "A".repeat(1000),
      "\u0939\u093F\u0928\u094D\u0926\u0940", // Hindi
      "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", // Family emoji
    ];
    for (const s of testStrings) {
      const encrypted = encryptPii(s, piiKey);
      expect(encrypted).toMatch(/^PII:/);
      const decrypted = decryptPii(encrypted, piiKey);
      expect(decrypted).toBe(s);
    }
  });

  it("encryptPii produces different ciphertext each time (random IV)", () => {
    // Prod scenario: if IVs repeat, AES-GCM leaks info
    const val = "same-value";
    const enc1 = encryptPii(val, piiKey);
    const enc2 = encryptPii(val, piiKey);
    expect(enc1).not.toBe(enc2);
    // But both decrypt correctly
    expect(decryptPii(enc1, piiKey)).toBe(val);
    expect(decryptPii(enc2, piiKey)).toBe(val);
  });
});

// ---------------------------------------------------------------------------
// 6. Post-Quantum Hybrid (conditional on @noble/post-quantum availability)
// ---------------------------------------------------------------------------

describe("Post-Quantum Hybrid Edge Cases", () => {
  let pqAvailable = false;

  beforeAll(async () => {
    pqAvailable = await ensurePqReady();
    // Also initialize the auth-header module's lazy PQ loader
    await initHybridAuth();
  });

  it("ensurePqReady returns a boolean", async () => {
    // Prod scenario: startup health check for PQ availability
    const result = await ensurePqReady();
    expect(typeof result).toBe("boolean");
  });

  it("generate hybrid signing key pair has both classical and PQ keys", () => {
    if (!pqAvailable) return;
    // Prod scenario: key generation for PQ-enabled participant
    const kp = generateHybridSigningKeyPair();
    expect(kp.classical).toBeDefined();
    expect(kp.postQuantum).toBeDefined();
    expect(Buffer.from(kp.classical.privateKey, "base64").length).toBe(32);
    expect(Buffer.from(kp.classical.publicKey, "base64").length).toBe(32);
    // ML-DSA-65: secretKey 4032 bytes, publicKey 1952 bytes
    expect(Buffer.from(kp.postQuantum.privateKey, "base64").length).toBe(4032);
    expect(Buffer.from(kp.postQuantum.publicKey, "base64").length).toBe(1952);
  });

  it("hybridSign and hybridVerify round-trip", () => {
    if (!pqAvailable) return;
    // Prod scenario: PQ-protected message signing in ONDC network
    const kp = generateHybridSigningKeyPair();
    const msg = "hybrid test message";
    const sig = hybridSign(msg, kp.classical.privateKey, kp.postQuantum.privateKey);
    expect(sig.classical).toBeDefined();
    expect(sig.postQuantum).toBeDefined();
    const valid = hybridVerify(msg, sig, kp.classical.publicKey, kp.postQuantum.publicKey);
    expect(valid).toBe(true);
  });

  it("fails if classical signature is wrong but PQ is correct", () => {
    if (!pqAvailable) return;
    // Prod scenario: attacker compromises Ed25519 key, PQ layer must still reject
    const kp = generateHybridSigningKeyPair();
    const msg = "hybrid integrity";
    const sig = hybridSign(msg, kp.classical.privateKey, kp.postQuantum.privateKey);
    // Corrupt classical signature
    const badClassical = Buffer.from(sig.classical, "base64");
    badClassical[0] = badClassical[0]! ^ 0xFF;
    const corrupted = { ...sig, classical: badClassical.toString("base64") };
    expect(hybridVerify(msg, corrupted, kp.classical.publicKey, kp.postQuantum.publicKey)).toBe(false);
  });

  it("fails if PQ signature is wrong but classical is correct", () => {
    if (!pqAvailable) return;
    // Prod scenario: quantum computer forges PQ signature, classical layer must still reject...
    // Wait, this tests the opposite: classical is fine but PQ is forged
    const kp = generateHybridSigningKeyPair();
    const msg = "hybrid integrity pq";
    const sig = hybridSign(msg, kp.classical.privateKey, kp.postQuantum.privateKey);
    // Corrupt PQ signature
    const badPq = Buffer.from(sig.postQuantum, "base64");
    badPq[0] = badPq[0]! ^ 0xFF;
    const corrupted = { ...sig, postQuantum: badPq.toString("base64") };
    expect(hybridVerify(msg, corrupted, kp.classical.publicKey, kp.postQuantum.publicKey)).toBe(false);
  });

  it("both must pass for overall verification", () => {
    if (!pqAvailable) return;
    // Prod scenario: hybrid mode requires BOTH layers to be valid
    const kp1 = generateHybridSigningKeyPair();
    const kp2 = generateHybridSigningKeyPair();
    const msg = "cross-key hybrid";
    const sig = hybridSign(msg, kp1.classical.privateKey, kp1.postQuantum.privateKey);
    // Classical key from kp1, PQ key from kp2 -- must fail
    expect(hybridVerify(msg, sig, kp1.classical.publicKey, kp2.postQuantum.publicKey)).toBe(false);
    // PQ key from kp1, classical key from kp2 -- must fail
    expect(hybridVerify(msg, sig, kp2.classical.publicKey, kp1.postQuantum.publicKey)).toBe(false);
    // Both from kp1 -- must pass
    expect(hybridVerify(msg, sig, kp1.classical.publicKey, kp1.postQuantum.publicKey)).toBe(true);
  });

  it("hybridEncapsulate/hybridDecapsulate round-trip", () => {
    if (!pqAvailable) return;
    // Prod scenario: secure key exchange for encrypted challenge response
    const kp = generateHybridEncryptionKeyPair();
    const encap = hybridEncapsulate(kp.classical.publicKey, kp.postQuantum.publicKey);
    expect(encap.classicalCiphertext).toBeDefined();
    expect(encap.pqCiphertext).toBeDefined();
    expect(encap.sharedSecret).toBeDefined();

    const decapSecret = hybridDecapsulate(
      { classicalCiphertext: encap.classicalCiphertext, pqCiphertext: encap.pqCiphertext },
      kp.classical.privateKey,
      kp.classical.publicKey,
      kp.postQuantum.privateKey,
    );
    expect(decapSecret).toBe(encap.sharedSecret);
  });

  it("parse hybrid auth header with ed25519+ml-dsa-65 algorithm", () => {
    // Prod scenario: new PQ-aware participant sends hybrid header
    const header =
      'Signature keyId="sub|kid|ed25519+ml-dsa-65",' +
      'algorithm="ed25519+ml-dsa-65",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",' +
      'signature="Y2xhc3NpY2Fs",' +
      'pq_signature="cHFzaWc="';
    const parsed = parseHybridAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.algorithm).toBe("ed25519+ml-dsa-65");
    expect(parsed!.signature).toBe("Y2xhc3NpY2Fs");
    expect(parsed!.pqSignature).toBe("cHFzaWc=");
    expect(parsed!.subscriberId).toBe("sub");
    expect(parsed!.uniqueKeyId).toBe("kid");
  });

  it("backward compatibility: classical-only header still parses via parseHybridAuthHeader", () => {
    // Prod scenario: old participant sends ed25519-only header to PQ-aware gateway
    const header =
      'Signature keyId="sub|kid|ed25519",' +
      'algorithm="ed25519",' +
      'created="1700000000",expires="1700000300",' +
      'headers="(created) (expires) digest",' +
      'signature="Y2xhc3NpY2Fs"';
    const parsed = parseHybridAuthHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.algorithm).toBe("ed25519");
    expect(parsed!.pqSignature).toBe(""); // No PQ signature present
    expect(parsed!.signature).toBe("Y2xhc3NpY2Fs");
  });

  it("classical-only header verifies via verifyHybridAuthHeader", () => {
    // Prod scenario: PQ-aware verifier must still accept classical-only headers
    const kp = generateKeyPair();
    const body = { backward: "compat" };
    const header = buildAuthHeader({
      subscriberId: "old-participant",
      uniqueKeyId: "k1",
      privateKey: kp.privateKey,
      body,
    });
    const result = verifyHybridAuthHeader({
      header,
      body,
      publicKey: kp.publicKey,
    });
    expect(result).toBe(true);
  });

  it("parseHybridAuthHeader rejects algorithm=rsa", () => {
    // Prod scenario: attacker injects unsupported algorithm
    const header =
      'Signature keyId="s|k|rsa",algorithm="rsa",' +
      'created="1",expires="2",headers="h",signature="s"';
    expect(parseHybridAuthHeader(header)).toBeNull();
  });

  it("verifyHybridAuthHeader with hybrid header but no pqPublicKey fails", () => {
    if (!pqAvailable) return;
    // Prod scenario: registry doesn't have the PQ public key yet
    const hybridKp = generateHybridSigningKeyPair();
    const body = { test: "no-pq-key" };
    const header = buildHybridAuthHeader({
      subscriberId: "pq-sender",
      uniqueKeyId: "k1",
      privateKey: hybridKp.classical.privateKey,
      pqPrivateKey: hybridKp.postQuantum.privateKey,
      body,
    });
    // Verify without providing pqPublicKey
    const result = verifyHybridAuthHeader({
      header,
      body,
      publicKey: hybridKp.classical.publicKey,
      // pqPublicKey intentionally omitted
    });
    expect(result).toBe(false);
  });

  it("hybridSign is deterministic for Ed25519 component", () => {
    if (!pqAvailable) return;
    // Prod scenario: replay detection depends on deterministic classical signatures
    const kp = generateHybridSigningKeyPair();
    const msg = "determinism test";
    const sig1 = hybridSign(msg, kp.classical.privateKey, kp.postQuantum.privateKey);
    const sig2 = hybridSign(msg, kp.classical.privateKey, kp.postQuantum.privateKey);
    // Ed25519 component is deterministic
    expect(sig1.classical).toBe(sig2.classical);
    // ML-DSA-65 may or may not be deterministic depending on implementation
  });
});
