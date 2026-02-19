import { describe, it, expect } from "vitest";
import { generateKeyPair, sign, verify } from "./ed25519.js";

describe("ed25519", () => {
  describe("generateKeyPair()", () => {
    it("returns an object with privateKey and publicKey strings", () => {
      const kp = generateKeyPair();
      expect(kp).toHaveProperty("privateKey");
      expect(kp).toHaveProperty("publicKey");
      expect(typeof kp.privateKey).toBe("string");
      expect(typeof kp.publicKey).toBe("string");
    });

    it("returns base64-encoded keys of proper byte length", () => {
      const kp = generateKeyPair();
      const privBytes = Buffer.from(kp.privateKey, "base64");
      const pubBytes = Buffer.from(kp.publicKey, "base64");
      // Ed25519 private key is 32 bytes, public key is 32 bytes
      expect(privBytes.length).toBe(32);
      expect(pubBytes.length).toBe(32);
    });

    it("returns valid base64 strings", () => {
      const kp = generateKeyPair();
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(kp.privateKey).toMatch(base64Regex);
      expect(kp.publicKey).toMatch(base64Regex);
    });

    it("generates unique key pairs each time", () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    });
  });

  describe("sign()", () => {
    it("produces a base64-encoded signature string", () => {
      const kp = generateKeyPair();
      const signature = sign("hello world", kp.privateKey);
      expect(typeof signature).toBe("string");
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(signature).toMatch(base64Regex);
    });

    it("produces a 64-byte Ed25519 signature", () => {
      const kp = generateKeyPair();
      const signature = sign("test message", kp.privateKey);
      const sigBytes = Buffer.from(signature, "base64");
      expect(sigBytes.length).toBe(64);
    });

    it("produces deterministic signatures for same key and message", () => {
      const kp = generateKeyPair();
      const sig1 = sign("deterministic test", kp.privateKey);
      const sig2 = sign("deterministic test", kp.privateKey);
      // Ed25519 signatures are deterministic (no random nonce)
      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different messages", () => {
      const kp = generateKeyPair();
      const sig1 = sign("message one", kp.privateKey);
      const sig2 = sign("message two", kp.privateKey);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures with different keys", () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const sig1 = sign("same message", kp1.privateKey);
      const sig2 = sign("same message", kp2.privateKey);
      expect(sig1).not.toBe(sig2);
    });

    it("can sign an empty string", () => {
      const kp = generateKeyPair();
      const signature = sign("", kp.privateKey);
      expect(typeof signature).toBe("string");
      expect(Buffer.from(signature, "base64").length).toBe(64);
    });

    it("can sign a long message", () => {
      const kp = generateKeyPair();
      const longMessage = "a".repeat(100_000);
      const signature = sign(longMessage, kp.privateKey);
      expect(typeof signature).toBe("string");
      expect(Buffer.from(signature, "base64").length).toBe(64);
    });

    it("can sign unicode content", () => {
      const kp = generateKeyPair();
      const signature = sign("Hello, world! Symbols: \u2603\u2764\u2602", kp.privateKey);
      expect(typeof signature).toBe("string");
      expect(Buffer.from(signature, "base64").length).toBe(64);
    });
  });

  describe("verify()", () => {
    it("returns true for a valid signature", () => {
      const kp = generateKeyPair();
      const message = "hello world";
      const signature = sign(message, kp.privateKey);
      const result = verify(message, signature, kp.publicKey);
      expect(result).toBe(true);
    });

    it("returns false for a wrong message", () => {
      const kp = generateKeyPair();
      const signature = sign("original message", kp.privateKey);
      const result = verify("tampered message", signature, kp.publicKey);
      expect(result).toBe(false);
    });

    it("returns false for a wrong public key", () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const message = "hello world";
      const signature = sign(message, kp1.privateKey);
      const result = verify(message, signature, kp2.publicKey);
      expect(result).toBe(false);
    });

    it("returns false when the signature is corrupted", () => {
      const kp = generateKeyPair();
      const message = "hello world";
      const signature = sign(message, kp.privateKey);
      // Corrupt one byte of the signature
      const sigBytes = Buffer.from(signature, "base64");
      sigBytes[0] = (sigBytes[0] + 1) % 256;
      const corruptedSig = sigBytes.toString("base64");
      const result = verify(message, corruptedSig, kp.publicKey);
      expect(result).toBe(false);
    });

    it("returns false when message has trailing whitespace added", () => {
      const kp = generateKeyPair();
      const message = "exact message";
      const signature = sign(message, kp.privateKey);
      const result = verify(message + " ", signature, kp.publicKey);
      expect(result).toBe(false);
    });
  });

  describe("round-trip sign + verify", () => {
    it("works for a simple string", () => {
      const kp = generateKeyPair();
      const message = "round trip test";
      const signature = sign(message, kp.privateKey);
      expect(verify(message, signature, kp.publicKey)).toBe(true);
    });

    it("works for an empty string", () => {
      const kp = generateKeyPair();
      const message = "";
      const signature = sign(message, kp.privateKey);
      expect(verify(message, signature, kp.publicKey)).toBe(true);
    });

    it("works for a JSON-like string", () => {
      const kp = generateKeyPair();
      const message = JSON.stringify({ action: "search", context: { domain: "retail" } });
      const signature = sign(message, kp.privateKey);
      expect(verify(message, signature, kp.publicKey)).toBe(true);
    });

    it("works for multi-line signing strings", () => {
      const kp = generateKeyPair();
      const message = "(created): 1700000000\n(expires): 1700000300\ndigest: BLAKE-512=abc123";
      const signature = sign(message, kp.privateKey);
      expect(verify(message, signature, kp.publicKey)).toBe(true);
    });

    it("works across multiple key pairs independently", () => {
      const pairs = Array.from({ length: 5 }, () => generateKeyPair());
      const message = "shared message";
      for (const kp of pairs) {
        const sig = sign(message, kp.privateKey);
        expect(verify(message, sig, kp.publicKey)).toBe(true);
        // Other keys should not verify
        for (const other of pairs) {
          if (other !== kp) {
            expect(verify(message, sig, other.publicKey)).toBe(false);
          }
        }
      }
    });
  });
});
