import { describe, it, expect } from "vitest";
import {
  OndcErrorCode,
  OndcErrorType,
  OndcOfficialErrorCode,
  ondcError,
  errorTypeFromCode,
  formatBecknError,
  mapToOfficialCode,
  formatOfficialBecknError,
} from "./error-codes.js";

// ---------------------------------------------------------------------------
// ondcError()
// ---------------------------------------------------------------------------

describe("ondcError", () => {
  it("should return correct type/code/message for a context error code", () => {
    const result = ondcError(OndcErrorCode.INVALID_REQUEST);
    expect(result.type).toBe(OndcErrorType.CONTEXT_ERROR);
    expect(result.code).toBe(OndcErrorCode.INVALID_REQUEST);
    expect(result.message).toBe("Invalid request");
  });

  it("should return correct metadata for a domain error code", () => {
    const result = ondcError(OndcErrorCode.ITEM_NOT_FOUND);
    expect(result.type).toBe(OndcErrorType.DOMAIN_ERROR);
    expect(result.code).toBe(OndcErrorCode.ITEM_NOT_FOUND);
    expect(result.message).toBe("Item not found");
  });

  it("should return correct metadata for a policy error code", () => {
    const result = ondcError(OndcErrorCode.RATE_LIMIT_EXCEEDED);
    expect(result.type).toBe(OndcErrorType.POLICY_ERROR);
    expect(result.code).toBe(OndcErrorCode.RATE_LIMIT_EXCEEDED);
    expect(result.message).toBe("Rate limit exceeded");
  });

  it("should return correct metadata for a business error code", () => {
    const result = ondcError(OndcErrorCode.ORDER_NOT_FOUND);
    expect(result.type).toBe(OndcErrorType.BUSINESS_ERROR);
    expect(result.code).toBe(OndcErrorCode.ORDER_NOT_FOUND);
    expect(result.message).toBe("Order not found");
  });

  it("should return correct metadata for a technical error code", () => {
    const result = ondcError(OndcErrorCode.TIMEOUT);
    expect(result.type).toBe(OndcErrorType.TECHNICAL_ERROR);
    expect(result.code).toBe(OndcErrorCode.TIMEOUT);
    expect(result.message).toBe("Timeout");
  });

  it("should throw for an unknown error code", () => {
    expect(() => ondcError(99999 as OndcErrorCode)).toThrow("Unknown ONDC error code");
  });
});

// ---------------------------------------------------------------------------
// errorTypeFromCode()
// ---------------------------------------------------------------------------

describe("errorTypeFromCode", () => {
  it("should map 10000-range codes to CONTEXT_ERROR", () => {
    expect(errorTypeFromCode(OndcErrorCode.INVALID_REQUEST)).toBe(OndcErrorType.CONTEXT_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.STALE_REQUEST)).toBe(OndcErrorType.CONTEXT_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.INVALID_CONTEXT_COUNTRY)).toBe(
      OndcErrorType.CONTEXT_ERROR,
    );
  });

  it("should map 20000-range codes to DOMAIN_ERROR", () => {
    expect(errorTypeFromCode(OndcErrorCode.INTERNAL_ERROR)).toBe(OndcErrorType.DOMAIN_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.INVALID_CATALOG)).toBe(OndcErrorType.DOMAIN_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.DOMAIN_NOT_SUPPORTED)).toBe(
      OndcErrorType.DOMAIN_ERROR,
    );
  });

  it("should map 30000-range codes to POLICY_ERROR", () => {
    expect(errorTypeFromCode(OndcErrorCode.POLICY_VIOLATION)).toBe(OndcErrorType.POLICY_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.RATE_LIMIT_EXCEEDED)).toBe(OndcErrorType.POLICY_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.DUPLICATE_REQUEST)).toBe(OndcErrorType.POLICY_ERROR);
  });

  it("should map 40000-range codes to BUSINESS_ERROR", () => {
    expect(errorTypeFromCode(OndcErrorCode.BUSINESS_ERROR)).toBe(OndcErrorType.BUSINESS_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.ORDER_NOT_FOUND)).toBe(OndcErrorType.BUSINESS_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.REFUND_NOT_POSSIBLE)).toBe(
      OndcErrorType.BUSINESS_ERROR,
    );
  });

  it("should map 50000-range codes to TECHNICAL_ERROR", () => {
    expect(errorTypeFromCode(OndcErrorCode.TECHNICAL_ERROR)).toBe(OndcErrorType.TECHNICAL_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.TIMEOUT)).toBe(OndcErrorType.TECHNICAL_ERROR);
    expect(errorTypeFromCode(OndcErrorCode.SERIALIZATION_ERROR)).toBe(
      OndcErrorType.TECHNICAL_ERROR,
    );
  });

  it("should throw for a code outside any known range", () => {
    expect(() => errorTypeFromCode(99999 as OndcErrorCode)).toThrow(
      "does not fall within a known range",
    );
  });
});

// ---------------------------------------------------------------------------
// formatBecknError()
// ---------------------------------------------------------------------------

describe("formatBecknError", () => {
  it("should return an object with type, code, and message as strings", () => {
    const result = formatBecknError(OndcErrorCode.INVALID_REQUEST);
    expect(typeof result.type).toBe("string");
    expect(typeof result.code).toBe("string");
    expect(typeof result.message).toBe("string");
  });

  it("should return the correct type for the error code", () => {
    const result = formatBecknError(OndcErrorCode.INVALID_REQUEST);
    expect(result.type).toBe("CONTEXT-ERROR");
  });

  it("should stringify the numeric code", () => {
    const result = formatBecknError(OndcErrorCode.INVALID_REQUEST);
    expect(result.code).toBe("10000");
  });

  it("should use the default message when no custom message is provided", () => {
    const result = formatBecknError(OndcErrorCode.ITEM_NOT_FOUND);
    expect(result.message).toBe("Item not found");
  });

  it("should use a custom message when provided, overriding the default", () => {
    const result = formatBecknError(
      OndcErrorCode.ITEM_NOT_FOUND,
      "Custom: the requested item does not exist",
    );
    expect(result.message).toBe("Custom: the requested item does not exist");
  });

  it("should throw for an unknown error code", () => {
    expect(() => formatBecknError(99999 as OndcErrorCode)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// mapToOfficialCode()
// ---------------------------------------------------------------------------

describe("mapToOfficialCode", () => {
  it("should map INVALID_REQUEST to GATEWAY_INVALID_REQUEST (10000)", () => {
    expect(mapToOfficialCode(OndcErrorCode.INVALID_REQUEST)).toBe(
      OndcOfficialErrorCode.GATEWAY_INVALID_REQUEST,
    );
  });

  it("should map INVALID_SIGNATURE to GATEWAY_INVALID_SIGNATURE (10001)", () => {
    expect(mapToOfficialCode(OndcErrorCode.INVALID_SIGNATURE)).toBe(
      OndcOfficialErrorCode.GATEWAY_INVALID_SIGNATURE,
    );
  });

  it("should map STALE_REQUEST to BUYER_STALE_REQUEST (20002)", () => {
    expect(mapToOfficialCode(OndcErrorCode.STALE_REQUEST)).toBe(
      OndcOfficialErrorCode.BUYER_STALE_REQUEST,
    );
  });

  it("should map ITEM_NOT_FOUND to BUYER_ITEM_NOT_FOUND (20004)", () => {
    expect(mapToOfficialCode(OndcErrorCode.ITEM_NOT_FOUND)).toBe(
      OndcOfficialErrorCode.BUYER_ITEM_NOT_FOUND,
    );
  });

  it("should map TIMEOUT to BUYER_TIMEOUT (20006)", () => {
    expect(mapToOfficialCode(OndcErrorCode.TIMEOUT)).toBe(OndcOfficialErrorCode.BUYER_TIMEOUT);
  });

  it("should map ORDER_NOT_FOUND to SELLER_ORDER_NOT_FOUND (30006)", () => {
    expect(mapToOfficialCode(OndcErrorCode.ORDER_NOT_FOUND)).toBe(
      OndcOfficialErrorCode.SELLER_ORDER_NOT_FOUND,
    );
  });

  it("should map PAYMENT_FAILED to SELLER_PAYMENT_FAILED (40002)", () => {
    expect(mapToOfficialCode(OndcErrorCode.PAYMENT_FAILED)).toBe(
      OndcOfficialErrorCode.SELLER_PAYMENT_FAILED,
    );
  });

  it("should fall back to the numeric code as a string for unmapped codes", () => {
    // DATABASE_ERROR (50005) has no official mapping
    const result = mapToOfficialCode(OndcErrorCode.DATABASE_ERROR);
    expect(result).toBe("50005");
  });
});

// ---------------------------------------------------------------------------
// formatOfficialBecknError()
// ---------------------------------------------------------------------------

describe("formatOfficialBecknError", () => {
  it("should return the correct structure for a gateway error", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.GATEWAY_INVALID_REQUEST);
    expect(result.type).toBe("CONTEXT-ERROR");
    expect(result.code).toBe("10000");
    expect(result.message).toBe("Invalid request");
  });

  it("should return DOMAIN-ERROR for buyer NP errors (20000-range)", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.BUYER_INVALID_CATALOG);
    expect(result.type).toBe("DOMAIN-ERROR");
    expect(result.code).toBe("20001");
    expect(result.message).toBe("Invalid catalog response");
  });

  it("should return POLICY-ERROR for seller NP validation errors (30000-range)", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.SELLER_PROVIDER_NOT_FOUND);
    expect(result.type).toBe("POLICY-ERROR");
    expect(result.code).toBe("30001");
    expect(result.message).toBe("Provider not found at seller NP");
  });

  it("should return BUSINESS-ERROR for seller business errors (40000-range)", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.SELLER_PAYMENT_FAILED);
    expect(result.type).toBe("BUSINESS-ERROR");
    expect(result.code).toBe("40002");
    expect(result.message).toBe("Payment failed");
  });

  it("should return TECHNICAL-ERROR for seller policy enforcement (50000-range)", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.SELLER_CANCELLATION_REJECTED);
    expect(result.type).toBe("TECHNICAL-ERROR");
    expect(result.code).toBe("50001");
    expect(result.message).toBe("Cancellation rejected");
  });

  it("should return TECHNICAL-ERROR for logistics SP errors (60000-range)", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.LSP_NOT_SERVICEABLE);
    expect(result.type).toBe("TECHNICAL-ERROR");
    expect(result.code).toBe("60001");
    expect(result.message).toBe("Location not serviceable");
  });

  it("should use a custom message when provided", () => {
    const result = formatOfficialBecknError(
      OndcOfficialErrorCode.GATEWAY_INVALID_REQUEST,
      "Custom gateway error message",
    );
    expect(result.message).toBe("Custom gateway error message");
    // Type and code should still be correct
    expect(result.type).toBe("CONTEXT-ERROR");
    expect(result.code).toBe("10000");
  });

  it("should produce string type, code, and message fields", () => {
    const result = formatOfficialBecknError(OndcOfficialErrorCode.BUYER_TIMEOUT);
    expect(typeof result.type).toBe("string");
    expect(typeof result.code).toBe("string");
    expect(typeof result.message).toBe("string");
  });
});
