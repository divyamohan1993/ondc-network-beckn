import { describe, it, expect } from "vitest";
import { buildContext } from "../../packages/shared/src/protocol/context.js";
import { validateBecknRequest } from "../../packages/shared/src/protocol/validator.js";
import { ack, nack } from "../../packages/shared/src/protocol/ack.js";
import { generateKeyPair, sign, verify } from "../../packages/shared/src/crypto/ed25519.js";
import { buildAuthHeader, verifyAuthHeader } from "../../packages/shared/src/crypto/auth-header.js";
import { OrderState, isValidOrderTransition } from "../../packages/shared/src/protocol/order-states.js";

describe("Beckn Protocol Flow Integration", () => {
  describe("Search Flow", () => {
    it("builds valid search context that passes validation", () => {
      const context = buildContext({
        domain: "ONDC:RET10",
        action: "search",
        bap_id: "bap.example.com",
        bap_uri: "https://bap.example.com/beckn",
      });

      const request = {
        context,
        message: { intent: { descriptor: { name: "laptop" } } },
      };

      const result = validateBecknRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("BAP signs request and BPP can verify", () => {
      const keyPair = generateKeyPair();
      const body = {
        context: buildContext({
          domain: "ONDC:RET10",
          action: "search",
          bap_id: "bap.example.com",
          bap_uri: "https://bap.example.com/beckn",
        }),
        message: { intent: { descriptor: { name: "phone" } } },
      };

      const authHeader = buildAuthHeader({
        subscriberId: "bap.example.com",
        uniqueKeyId: "key-1",
        privateKey: keyPair.privateKey,
        body,
      });

      const isValid = verifyAuthHeader({
        header: authHeader,
        body,
        publicKey: keyPair.publicKey,
      });

      expect(isValid).toBe(true);
    });

    it("ACK response has correct structure", () => {
      const response = ack();
      expect(response.message.ack.status).toBe("ACK");
    });

    it("NACK response includes error details", () => {
      const response = nack("DOMAIN-ERROR", "20001", "Invalid catalog");
      expect(response.message.ack.status).toBe("NACK");
      expect(response.error).toBeDefined();
      expect(response.error!.type).toBe("DOMAIN-ERROR");
      expect(response.error!.code).toBe("20001");
      expect(response.error!.message).toBe("Invalid catalog");
    });
  });

  describe("Select → Init → Confirm Flow", () => {
    it("builds valid select context with bpp_id", () => {
      const context = buildContext({
        domain: "ONDC:RET10",
        action: "select",
        bap_id: "bap.example.com",
        bap_uri: "https://bap.example.com/beckn",
        bpp_id: "bpp.example.com",
        bpp_uri: "https://bpp.example.com/beckn",
      });

      const request = {
        context,
        message: {
          order: {
            provider: { id: "p1" },
            items: [{ id: "i1", quantity: { count: 1 } }],
          },
        },
      };

      const result = validateBecknRequest(request);
      expect(result.valid).toBe(true);
    });

    it("builds valid confirm context with bpp_id", () => {
      const context = buildContext({
        domain: "ONDC:RET10",
        action: "confirm",
        bap_id: "bap.example.com",
        bap_uri: "https://bap.example.com/beckn",
        bpp_id: "bpp.example.com",
        bpp_uri: "https://bpp.example.com/beckn",
      });

      const request = {
        context,
        message: { order: { id: "order-1" } },
      };

      const result = validateBecknRequest(request);
      expect(result.valid).toBe(true);
    });
  });

  describe("Callback Flow", () => {
    it("on_search callback context passes validation", () => {
      const context = buildContext({
        domain: "ONDC:RET10",
        action: "on_search",
        bap_id: "bap.example.com",
        bap_uri: "https://bap.example.com/beckn",
        bpp_id: "bpp.example.com",
        bpp_uri: "https://bpp.example.com/beckn",
      });

      const request = {
        context,
        message: { catalog: {} },
      };

      const result = validateBecknRequest(request);
      expect(result.valid).toBe(true);
    });

    it("callback preserves original message_id", () => {
      const originalMessageId = "550e8400-e29b-41d4-a716-446655440000";
      const context = buildContext({
        domain: "ONDC:RET10",
        action: "on_search",
        bap_id: "bap.example.com",
        bap_uri: "https://bap.example.com/beckn",
        bpp_id: "bpp.example.com",
        bpp_uri: "https://bpp.example.com/beckn",
        message_id: originalMessageId,
      });

      expect(context.message_id).toBe(originalMessageId);
    });
  });

  describe("Order State Machine", () => {
    it("follows valid order lifecycle: Created → Accepted → InProgress → Completed", () => {
      expect(isValidOrderTransition(OrderState.Created, OrderState.Accepted)).toBe(true);
      expect(isValidOrderTransition(OrderState.Accepted, OrderState.InProgress)).toBe(true);
      expect(isValidOrderTransition(OrderState.InProgress, OrderState.Completed)).toBe(true);
    });

    it("allows return after completion", () => {
      expect(isValidOrderTransition(OrderState.Completed, OrderState.Returned)).toBe(true);
    });

    it("allows cancellation at multiple stages", () => {
      expect(isValidOrderTransition(OrderState.Created, OrderState.Cancelled)).toBe(true);
      expect(isValidOrderTransition(OrderState.Accepted, OrderState.Cancelled)).toBe(true);
      expect(isValidOrderTransition(OrderState.InProgress, OrderState.Cancelled)).toBe(true);
    });

    it("prevents invalid transitions", () => {
      expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Created)).toBe(false);
      expect(isValidOrderTransition(OrderState.Returned, OrderState.InProgress)).toBe(false);
      expect(isValidOrderTransition(OrderState.Created, OrderState.Completed)).toBe(false);
    });
  });

  describe("Auth Header Round-Trip", () => {
    it("full sign-verify cycle works with different bodies", () => {
      const keyPair = generateKeyPair();

      const bodies = [
        { context: { action: "search" }, message: {} },
        { context: { action: "select" }, message: { order: { id: "1" } } },
        { data: "test", nested: { key: "value" } },
      ];

      for (const body of bodies) {
        const header = buildAuthHeader({
          subscriberId: "test.example.com",
          uniqueKeyId: "k1",
          privateKey: keyPair.privateKey,
          body,
        });

        const valid = verifyAuthHeader({
          header,
          body,
          publicKey: keyPair.publicKey,
        });

        expect(valid).toBe(true);
      }
    });

    it("verification fails when body is modified after signing", () => {
      const keyPair = generateKeyPair();
      const body = { context: { action: "search" }, message: { intent: { name: "original" } } };

      const header = buildAuthHeader({
        subscriberId: "test.example.com",
        uniqueKeyId: "k1",
        privateKey: keyPair.privateKey,
        body,
      });

      const modifiedBody = { ...body, message: { intent: { name: "modified" } } };

      const valid = verifyAuthHeader({
        header,
        body: modifiedBody,
        publicKey: keyPair.publicKey,
      });

      expect(valid).toBe(false);
    });
  });
});
