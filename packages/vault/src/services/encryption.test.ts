import { describe, it, expect } from "vitest";
import { EncryptionService } from "./encryption.js";

describe("EncryptionService", () => {
  const validMasterKey = "test-master-key-at-least-16-chars";

  describe("constructor", () => {
    it("creates an instance with valid master key", () => {
      const service = new EncryptionService(validMasterKey);
      expect(service).toBeInstanceOf(EncryptionService);
    });

    it("throws for empty master key", () => {
      expect(() => new EncryptionService("")).toThrow("VAULT_MASTER_KEY must be at least 16 characters");
    });

    it("throws for short master key", () => {
      expect(() => new EncryptionService("short")).toThrow("VAULT_MASTER_KEY must be at least 16 characters");
    });

    it("throws for master key of exactly 15 characters", () => {
      expect(() => new EncryptionService("a".repeat(15))).toThrow();
    });

    it("accepts master key of exactly 16 characters", () => {
      expect(() => new EncryptionService("a".repeat(16))).not.toThrow();
    });
  });

  describe("encrypt/decrypt", () => {
    const service = new EncryptionService(validMasterKey);

    it("round-trips plaintext", () => {
      const plaintext = "hello world secret";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts to base64 string", () => {
      const encrypted = service.encrypt("test");
      expect(typeof encrypted).toBe("string");
      // Valid base64
      expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    });

    it("produces different ciphertext for same plaintext (random IV)", () => {
      const encrypted1 = service.encrypt("same-input");
      const encrypted2 = service.encrypt("same-input");
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("encrypts empty string but decrypt rejects it (no ciphertext bytes)", () => {
      const encrypted = service.encrypt("");
      // AES-GCM with empty plaintext produces 0 ciphertext bytes.
      // The decrypt guard requires at least 1 byte of ciphertext.
      expect(() => service.decrypt(encrypted)).toThrow("too short");
    });

    it("handles long strings", () => {
      const longText = "x".repeat(100_000);
      const encrypted = service.encrypt(longText);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(longText);
    });

    it("handles special characters and unicode", () => {
      const text = "Hello 🌍 Ñoño àéîõü 日本語 中文";
      const encrypted = service.encrypt(text);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(text);
    });

    it("handles JSON strings", () => {
      const json = JSON.stringify({ key: "value", nested: { arr: [1, 2, 3] } });
      const encrypted = service.encrypt(json);
      const decrypted = service.decrypt(encrypted);
      expect(JSON.parse(decrypted)).toEqual({ key: "value", nested: { arr: [1, 2, 3] } });
    });

    it("fails to decrypt with different master key", () => {
      const service2 = new EncryptionService("different-master-key-for-test");
      const encrypted = service.encrypt("secret data");
      expect(() => service2.decrypt(encrypted)).toThrow();
    });

    it("fails to decrypt tampered ciphertext", () => {
      const encrypted = service.encrypt("tamper test");
      const buf = Buffer.from(encrypted, "base64");
      // Flip a byte in the ciphertext area (after iv+authTag = 28 bytes)
      if (buf.length > 29) {
        buf[29] = buf[29]! ^ 0xff;
      }
      const tampered = buf.toString("base64");
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it("fails to decrypt truncated data", () => {
      expect(() => service.decrypt("dG9vc2hvcnQ=")).toThrow("Invalid encrypted data: too short");
    });
  });

  describe("generatePassword", () => {
    it("generates hex-encoded string of default length", () => {
      const pw = EncryptionService.generatePassword();
      expect(typeof pw).toBe("string");
      expect(pw).toMatch(/^[0-9a-f]+$/);
      expect(pw.length).toBe(64); // 32 bytes * 2 hex chars
    });

    it("generates custom length", () => {
      const pw = EncryptionService.generatePassword(16);
      expect(pw.length).toBe(32); // 16 bytes * 2 hex chars
    });

    it("generates unique passwords", () => {
      const pw1 = EncryptionService.generatePassword();
      const pw2 = EncryptionService.generatePassword();
      expect(pw1).not.toBe(pw2);
    });
  });

  describe("generateToken", () => {
    it("generates base64url-encoded string of default length", () => {
      const token = EncryptionService.generateToken();
      expect(typeof token).toBe("string");
      // base64url chars only
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("generates custom length", () => {
      const token = EncryptionService.generateToken(16);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("generates unique tokens", () => {
      const t1 = EncryptionService.generateToken();
      const t2 = EncryptionService.generateToken();
      expect(t1).not.toBe(t2);
    });
  });
});
