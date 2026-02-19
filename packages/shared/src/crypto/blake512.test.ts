import { describe, it, expect } from "vitest";
import { hashBody, createDigestHeader } from "./blake512.js";

describe("blake512", () => {
  describe("hashBody()", () => {
    it("returns a base64 string when given a string input", () => {
      const result = hashBody("hello world");
      expect(typeof result).toBe("string");
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(result).toMatch(base64Regex);
    });

    it("returns a 64-byte (512-bit) digest encoded as base64", () => {
      const result = hashBody("test data");
      const bytes = Buffer.from(result, "base64");
      expect(bytes.length).toBe(64);
    });

    it("returns a base64 string when given an object input", () => {
      const result = hashBody({ key: "value" });
      expect(typeof result).toBe("string");
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(result).toMatch(base64Regex);
    });

    it("hashes objects by JSON.stringifying them", () => {
      const obj = { action: "search", context: { domain: "retail" } };
      const fromObject = hashBody(obj);
      const fromString = hashBody(JSON.stringify(obj));
      expect(fromObject).toBe(fromString);
    });

    it("is deterministic: same input produces the same hash", () => {
      const hash1 = hashBody("deterministic input");
      const hash2 = hashBody("deterministic input");
      expect(hash1).toBe(hash2);
    });

    it("is deterministic for object inputs", () => {
      const obj = { foo: "bar", num: 42 };
      const hash1 = hashBody(obj);
      const hash2 = hashBody(obj);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different string inputs", () => {
      const hash1 = hashBody("input one");
      const hash2 = hashBody("input two");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for different object inputs", () => {
      const hash1 = hashBody({ key: "value1" });
      const hash2 = hashBody({ key: "value2" });
      expect(hash1).not.toBe(hash2);
    });

    it("can hash an empty string", () => {
      const result = hashBody("");
      expect(typeof result).toBe("string");
      expect(Buffer.from(result, "base64").length).toBe(64);
    });

    it("can hash an empty object", () => {
      const result = hashBody({});
      expect(typeof result).toBe("string");
      expect(Buffer.from(result, "base64").length).toBe(64);
    });

    it("treats string '{}' the same as empty object", () => {
      const fromString = hashBody("{}");
      const fromObject = hashBody({});
      expect(fromString).toBe(fromObject);
    });

    it("is sensitive to key ordering in objects (JSON.stringify order)", () => {
      // JSON.stringify preserves insertion order, so different orders produce
      // different strings and therefore different hashes
      const obj1 = JSON.parse('{"a":"1","b":"2"}') as object;
      const obj2 = JSON.parse('{"b":"2","a":"1"}') as object;
      const hash1 = hashBody(obj1);
      const hash2 = hashBody(obj2);
      // These may differ because JSON.stringify preserves insertion order
      // The hashes should only be the same if the JSON strings are identical
      const str1 = JSON.stringify(obj1);
      const str2 = JSON.stringify(obj2);
      if (str1 === str2) {
        expect(hash1).toBe(hash2);
      } else {
        expect(hash1).not.toBe(hash2);
      }
    });

    it("handles unicode content", () => {
      const result = hashBody("Hello \u4e16\u754c \ud83c\udf0d");
      expect(typeof result).toBe("string");
      expect(Buffer.from(result, "base64").length).toBe(64);
    });

    it("handles large inputs", () => {
      const largeString = "x".repeat(1_000_000);
      const result = hashBody(largeString);
      expect(typeof result).toBe("string");
      expect(Buffer.from(result, "base64").length).toBe(64);
    });
  });

  describe("createDigestHeader()", () => {
    it('returns a string in the format "BLAKE-512=<base64>"', () => {
      const header = createDigestHeader("hello");
      expect(header).toMatch(/^BLAKE-512=[A-Za-z0-9+/]+=*$/);
    });

    it("uses the same hash as hashBody()", () => {
      const body = "test body content";
      const expectedHash = hashBody(body);
      const header = createDigestHeader(body);
      expect(header).toBe(`BLAKE-512=${expectedHash}`);
    });

    it("works with object input", () => {
      const obj = { context: { domain: "nic2004:52110" }, message: {} };
      const header = createDigestHeader(obj);
      expect(header.startsWith("BLAKE-512=")).toBe(true);
      const expectedHash = hashBody(obj);
      expect(header).toBe(`BLAKE-512=${expectedHash}`);
    });

    it("is deterministic for the same input", () => {
      const header1 = createDigestHeader("same input");
      const header2 = createDigestHeader("same input");
      expect(header1).toBe(header2);
    });

    it("produces different headers for different inputs", () => {
      const header1 = createDigestHeader("input A");
      const header2 = createDigestHeader("input B");
      expect(header1).not.toBe(header2);
    });

    it("works with an empty string", () => {
      const header = createDigestHeader("");
      expect(header).toMatch(/^BLAKE-512=.+$/);
    });

    it("works with nested objects", () => {
      const nested = {
        context: {
          domain: "retail",
          action: "search",
          core_version: "1.0.0",
        },
        message: {
          intent: {
            item: { descriptor: { name: "laptop" } },
          },
        },
      };
      const header = createDigestHeader(nested);
      expect(header.startsWith("BLAKE-512=")).toBe(true);
    });
  });
});
