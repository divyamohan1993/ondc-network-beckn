import { describe, it, expect, beforeEach } from "vitest";
import { cachePublicKey, invalidateKey } from "./key-store.js";

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
    _store: store,
  } as any;
}

describe("Key Store - Redis Caching", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  describe("cachePublicKey", () => {
    it("stores public key in Redis", async () => {
      await cachePublicKey("subscriber-1", "key-1", "base64PublicKey==", redis);
      const stored = await redis.get("pubkey:subscriber-1:key-1");
      expect(stored).toBe("base64PublicKey==");
    });

    it("overwrites existing cached key", async () => {
      await cachePublicKey("sub-1", "k-1", "oldKey", redis);
      await cachePublicKey("sub-1", "k-1", "newKey", redis);
      const stored = await redis.get("pubkey:sub-1:k-1");
      expect(stored).toBe("newKey");
    });

    it("stores different keys for different subscribers", async () => {
      await cachePublicKey("sub-1", "k-1", "key1", redis);
      await cachePublicKey("sub-2", "k-1", "key2", redis);
      expect(await redis.get("pubkey:sub-1:k-1")).toBe("key1");
      expect(await redis.get("pubkey:sub-2:k-1")).toBe("key2");
    });
  });

  describe("invalidateKey", () => {
    it("removes cached key from Redis", async () => {
      await cachePublicKey("sub-1", "k-1", "someKey", redis);
      await invalidateKey("sub-1", "k-1", redis);
      const result = await redis.get("pubkey:sub-1:k-1");
      expect(result).toBeNull();
    });

    it("does nothing for non-existent key", async () => {
      // Should not throw
      await expect(
        invalidateKey("nonexistent", "k-1", redis)
      ).resolves.not.toThrow();
    });
  });
});
