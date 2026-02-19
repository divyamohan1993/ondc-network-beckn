import { describe, it, expect } from "vitest";
import { ack, nack } from "./ack.js";

// ---------------------------------------------------------------------------
// ack()
// ---------------------------------------------------------------------------

describe("ack", () => {
  it('should return the standard ACK structure with status "ACK"', () => {
    const result = ack();

    expect(result).toEqual({
      message: {
        ack: {
          status: "ACK",
        },
      },
    });
  });

  it("should have message.ack.status exactly equal to 'ACK'", () => {
    const result = ack();
    expect(result.message.ack.status).toBe("ACK");
  });

  it("should not include an error field", () => {
    const result = ack();
    expect((result as Record<string, unknown>).error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nack()
// ---------------------------------------------------------------------------

describe("nack", () => {
  it('should return the standard NACK structure with status "NACK"', () => {
    const result = nack("CONTEXT-ERROR", "10000", "Invalid request");

    expect(result).toEqual({
      message: {
        ack: {
          status: "NACK",
        },
      },
      error: {
        type: "CONTEXT-ERROR",
        code: "10000",
        message: "Invalid request",
      },
    });
  });

  it("should include the provided error type", () => {
    const result = nack("DOMAIN-ERROR", "20001", "Invalid catalog");
    expect(result.error?.type).toBe("DOMAIN-ERROR");
  });

  it("should include the provided error code", () => {
    const result = nack("POLICY-ERROR", "30001", "Rate limit exceeded");
    expect(result.error?.code).toBe("30001");
  });

  it("should include the provided error message", () => {
    const result = nack("BUSINESS-ERROR", "40001", "Order not found");
    expect(result.error?.message).toBe("Order not found");
  });

  it("should have message.ack.status exactly equal to 'NACK'", () => {
    const result = nack("TECHNICAL-ERROR", "50000", "Technical error");
    expect(result.message.ack.status).toBe("NACK");
  });

  it("should return different error details for different inputs", () => {
    const result1 = nack("CONTEXT-ERROR", "10001", "Invalid signature");
    const result2 = nack("DOMAIN-ERROR", "20002", "Item not found");

    expect(result1.error).not.toEqual(result2.error);
    expect(result1.error?.type).toBe("CONTEXT-ERROR");
    expect(result2.error?.type).toBe("DOMAIN-ERROR");
  });
});
