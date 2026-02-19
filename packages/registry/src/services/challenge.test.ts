import { describe, it, expect, beforeEach } from "vitest";
import {
  generateChallenge,
  storeChallenge,
  getChallenge,
  verifyChallenge,
  encryptChallenge,
} from "./challenge.js";

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
    _store: store,
  } as any;
}

describe("Challenge Service", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  describe("generateChallenge", () => {
    it("returns a non-empty base64 string", () => {
      const challenge = generateChallenge();
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe("string");
      expect(challenge.length).toBeGreaterThan(0);
      // Verify it's valid base64
      expect(() => Buffer.from(challenge, "base64")).not.toThrow();
    });

    it("returns unique values each call", () => {
      const c1 = generateChallenge();
      const c2 = generateChallenge();
      const c3 = generateChallenge();
      expect(c1).not.toBe(c2);
      expect(c2).not.toBe(c3);
      expect(c1).not.toBe(c3);
    });
  });

  describe("storeChallenge", () => {
    it("stores the challenge in Redis", async () => {
      const challenge = generateChallenge();
      await storeChallenge("subscriber-1", challenge, redis);

      // The challenge should be retrievable
      const stored = await getChallenge("subscriber-1", redis);
      expect(stored).toBe(challenge);
    });
  });

  describe("getChallenge", () => {
    it("retrieves the stored challenge", async () => {
      const challenge = generateChallenge();
      await storeChallenge("subscriber-1", challenge, redis);

      const result = await getChallenge("subscriber-1", redis);
      expect(result).toBe(challenge);
    });

    it("returns null when no challenge stored", async () => {
      const result = await getChallenge("nonexistent-subscriber", redis);
      expect(result).toBeNull();
    });
  });

  describe("verifyChallenge", () => {
    it("returns true for correct answer", async () => {
      const challenge = generateChallenge();
      await storeChallenge("subscriber-1", challenge, redis);

      const result = await verifyChallenge("subscriber-1", challenge, redis);
      expect(result).toBe(true);
    });

    it("returns false for wrong answer", async () => {
      const challenge = generateChallenge();
      await storeChallenge("subscriber-1", challenge, redis);

      const result = await verifyChallenge("subscriber-1", "wrong-answer", redis);
      expect(result).toBe(false);
    });

    it("returns false when no challenge exists", async () => {
      const result = await verifyChallenge("nonexistent", "any-answer", redis);
      expect(result).toBe(false);
    });

    it("deletes the challenge after verification (one-time use)", async () => {
      const challenge = generateChallenge();
      await storeChallenge("subscriber-1", challenge, redis);

      // First verification should succeed
      const first = await verifyChallenge("subscriber-1", challenge, redis);
      expect(first).toBe(true);

      // Second verification with same answer should fail (challenge deleted)
      const second = await verifyChallenge("subscriber-1", challenge, redis);
      expect(second).toBe(false);
    });
  });

  describe("encryptChallenge", () => {
    it("returns a non-empty string (encrypted data)", () => {
      const challenge = generateChallenge();
      // Generate an X25519 public key for testing (32 bytes, base64-encoded)
      const testPublicKey = Buffer.from(
        new Uint8Array(32).fill(1)
      ).toString("base64");

      const encrypted = encryptChallenge(challenge, testPublicKey);
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);
    });
  });
});
