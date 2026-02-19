import { describe, it, expect } from "vitest";
import { DiscoveryService } from "./discovery.js";

function createMockRegistryClient(subscribers: any[]) {
  return {
    lookupByDomainCity: async (
      _domain: string,
      _city: string,
      _type?: string
    ) => subscribers,
    lookup: async () => null,
    subscribe: async () => null,
  } as any;
}

describe("DiscoveryService", () => {
  describe("findMatchingBPPs", () => {
    it("returns SUBSCRIBED BPPs with valid URLs and keys", async () => {
      const mockSubscribers = [
        {
          subscriber_id: "bpp1.example.com",
          subscriber_url: "https://bpp1.example.com/beckn",
          signing_public_key: "publicKey1==",
          status: "SUBSCRIBED",
        },
        {
          subscriber_id: "bpp2.example.com",
          subscriber_url: "https://bpp2.example.com/beckn",
          signing_public_key: "publicKey2==",
          status: "SUBSCRIBED",
        },
      ];

      const registryClient = createMockRegistryClient(mockSubscribers);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET10", "std:080");

      expect(results).toHaveLength(2);
      expect(results[0].subscriber_id).toBe("bpp1.example.com");
      expect(results[0].subscriber_url).toBe(
        "https://bpp1.example.com/beckn"
      );
      expect(results[0].signing_public_key).toBe("publicKey1==");
    });

    it("filters out non-SUBSCRIBED BPPs", async () => {
      const mockSubscribers = [
        {
          subscriber_id: "bpp1.example.com",
          subscriber_url: "https://bpp1.example.com/beckn",
          signing_public_key: "key1==",
          status: "SUBSCRIBED",
        },
        {
          subscriber_id: "bpp2.example.com",
          subscriber_url: "https://bpp2.example.com/beckn",
          signing_public_key: "key2==",
          status: "SUSPENDED",
        },
        {
          subscriber_id: "bpp3.example.com",
          subscriber_url: "https://bpp3.example.com/beckn",
          signing_public_key: "key3==",
          status: "INITIATED",
        },
      ];

      const registryClient = createMockRegistryClient(mockSubscribers);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET10", "std:080");

      expect(results).toHaveLength(1);
      expect(results[0].subscriber_id).toBe("bpp1.example.com");
    });

    it("filters out BPPs without subscriber_url", async () => {
      const mockSubscribers = [
        {
          subscriber_id: "bpp1.example.com",
          subscriber_url: "",
          signing_public_key: "key1==",
          status: "SUBSCRIBED",
        },
      ];

      const registryClient = createMockRegistryClient(mockSubscribers);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET10", "std:080");

      expect(results).toHaveLength(0);
    });

    it("filters out BPPs without signing_public_key", async () => {
      const mockSubscribers = [
        {
          subscriber_id: "bpp1.example.com",
          subscriber_url: "https://bpp1.example.com/beckn",
          signing_public_key: "",
          status: "SUBSCRIBED",
        },
      ];

      const registryClient = createMockRegistryClient(mockSubscribers);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET10", "std:080");

      expect(results).toHaveLength(0);
    });

    it("returns empty array when no subscribers found", async () => {
      const registryClient = createMockRegistryClient([]);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET10", "std:080");

      expect(results).toHaveLength(0);
    });

    it("maps subscriber fields to MatchingBPP shape", async () => {
      const mockSubscribers = [
        {
          subscriber_id: "bpp.test.com",
          subscriber_url: "https://bpp.test.com/api",
          signing_public_key: "testKey123==",
          status: "SUBSCRIBED",
          extra_field: "ignored",
        },
      ];

      const registryClient = createMockRegistryClient(mockSubscribers);
      const discovery = new DiscoveryService(registryClient);
      const results = await discovery.findMatchingBPPs("ONDC:RET11", "std:011");

      expect(results).toHaveLength(1);
      const bpp = results[0];
      expect(Object.keys(bpp)).toEqual([
        "subscriber_id",
        "subscriber_url",
        "signing_public_key",
      ]);
    });
  });
});
