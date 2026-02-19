import { describe, it, expect } from "vitest";
import { generateEncryptionKeyPair, encrypt, decrypt } from "./x25519.js";

describe("x25519", () => {
  describe("generateEncryptionKeyPair()", () => {
    it("returns an object with privateKey and publicKey strings", () => {
      const kp = generateEncryptionKeyPair();
      expect(kp).toHaveProperty("privateKey");
      expect(kp).toHaveProperty("publicKey");
      expect(typeof kp.privateKey).toBe("string");
      expect(typeof kp.publicKey).toBe("string");
    });

    it("returns base64-encoded keys", () => {
      const kp = generateEncryptionKeyPair();
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(kp.privateKey).toMatch(base64Regex);
      expect(kp.publicKey).toMatch(base64Regex);
    });

    it("returns 32-byte keys (X25519 key size)", () => {
      const kp = generateEncryptionKeyPair();
      const privBytes = Buffer.from(kp.privateKey, "base64");
      const pubBytes = Buffer.from(kp.publicKey, "base64");
      expect(privBytes.length).toBe(32);
      expect(pubBytes.length).toBe(32);
    });

    it("generates unique key pairs each time", () => {
      const kp1 = generateEncryptionKeyPair();
      const kp2 = generateEncryptionKeyPair();
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    });
  });

  describe("encrypt()", () => {
    it("returns a base64-encoded string", () => {
      const kp = generateEncryptionKeyPair();
      const encrypted = encrypt("hello world", kp.publicKey);
      expect(typeof encrypted).toBe("string");
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(encrypted).toMatch(base64Regex);
    });

    it("produces output containing ephemeral key + IV + authTag + ciphertext", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "test data";
      const encrypted = encrypt(plaintext, kp.publicKey);
      const payload = Buffer.from(encrypted, "base64");
      // Minimum size: 32 (ephemeral pub) + 12 (iv) + 16 (authTag) + at least 1 byte ciphertext
      expect(payload.length).toBeGreaterThanOrEqual(32 + 12 + 16 + 1);
    });

    it("produces different ciphertext each time due to randomized ephemeral key and IV", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "same plaintext";
      const enc1 = encrypt(plaintext, kp.publicKey);
      const enc2 = encrypt(plaintext, kp.publicKey);
      expect(enc1).not.toBe(enc2);
    });

    it("can encrypt an empty string", () => {
      const kp = generateEncryptionKeyPair();
      const encrypted = encrypt("", kp.publicKey);
      expect(typeof encrypted).toBe("string");
      const payload = Buffer.from(encrypted, "base64");
      // 32 (ephemeral pub) + 12 (iv) + 16 (authTag) + 0 (empty ciphertext)
      expect(payload.length).toBe(32 + 12 + 16);
    });

    it("can encrypt a long message", () => {
      const kp = generateEncryptionKeyPair();
      const longMessage = "a".repeat(100_000);
      const encrypted = encrypt(longMessage, kp.publicKey);
      expect(typeof encrypted).toBe("string");
    });

    it("can encrypt unicode content", () => {
      const kp = generateEncryptionKeyPair();
      const encrypted = encrypt("Hello \u4e16\u754c \ud83c\udf0d", kp.publicKey);
      expect(typeof encrypted).toBe("string");
    });
  });

  describe("decrypt()", () => {
    it("decrypts data encrypted with the corresponding public key", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "hello world";
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(decrypted).toBe(plaintext);
    });

    it("throws when decrypting with a wrong private key", () => {
      const kp1 = generateEncryptionKeyPair();
      const kp2 = generateEncryptionKeyPair();
      const plaintext = "secret data";
      const encrypted = encrypt(plaintext, kp1.publicKey);
      expect(() => decrypt(encrypted, kp2.privateKey, "")).toThrow();
    });

    it("throws when ciphertext is corrupted", () => {
      const kp = generateEncryptionKeyPair();
      const encrypted = encrypt("important data", kp.publicKey);
      const payload = Buffer.from(encrypted, "base64");
      // Corrupt a byte in the ciphertext portion (after header bytes)
      if (payload.length > 61) {
        payload[61] = (payload[61] + 1) % 256;
      }
      const corrupted = payload.toString("base64");
      expect(() => decrypt(corrupted, kp.privateKey, "")).toThrow();
    });

    it("throws when the auth tag is tampered with", () => {
      const kp = generateEncryptionKeyPair();
      const encrypted = encrypt("authenticated data", kp.publicKey);
      const payload = Buffer.from(encrypted, "base64");
      // Corrupt a byte in the authTag region (bytes 44-60)
      payload[50] = (payload[50] + 1) % 256;
      const corrupted = payload.toString("base64");
      expect(() => decrypt(corrupted, kp.privateKey, "")).toThrow();
    });

    it("accepts any string for the unused third parameter", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "test";
      const encrypted = encrypt(plaintext, kp.publicKey);
      // The third parameter (_publicKeyBase64) is not used in decryption
      expect(decrypt(encrypted, kp.privateKey, "")).toBe(plaintext);
      expect(decrypt(encrypted, kp.privateKey, "anything")).toBe(plaintext);
      expect(decrypt(encrypted, kp.privateKey, kp.publicKey)).toBe(plaintext);
    });
  });

  describe("encrypt/decrypt round-trip", () => {
    it("round-trips a simple string", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "round trip test";
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(decrypted).toBe(plaintext);
    });

    it("round-trips an empty string", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "";
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(decrypted).toBe(plaintext);
    });

    it("round-trips JSON data", () => {
      const kp = generateEncryptionKeyPair();
      const data = { subscriberId: "example.com", apiKey: "s3cr3t", nested: { deep: true } };
      const plaintext = JSON.stringify(data);
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it("round-trips unicode content", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "Hello \u4e16\u754c \ud83c\udf0d \u00e9\u00e0\u00fc\u00f1";
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(decrypted).toBe(plaintext);
    });

    it("round-trips a large payload", () => {
      const kp = generateEncryptionKeyPair();
      const plaintext = "x".repeat(50_000);
      const encrypted = encrypt(plaintext, kp.publicKey);
      const decrypted = decrypt(encrypted, kp.privateKey, "");
      expect(decrypted).toBe(plaintext);
    });

    it("works with multiple independent key pairs", () => {
      const pairs = Array.from({ length: 5 }, () => generateEncryptionKeyPair());
      const message = "message for each recipient";
      for (const kp of pairs) {
        const encrypted = encrypt(message, kp.publicKey);
        const decrypted = decrypt(encrypted, kp.privateKey, "");
        expect(decrypted).toBe(message);
      }
    });

    it("cannot decrypt a message encrypted for a different recipient", () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();
      const encrypted = encrypt("for alice only", alice.publicKey);
      // Bob should not be able to decrypt
      expect(() => decrypt(encrypted, bob.privateKey, "")).toThrow();
      // Alice can decrypt
      expect(decrypt(encrypted, alice.privateKey, "")).toBe("for alice only");
    });
  });
});
