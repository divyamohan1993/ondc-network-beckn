import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFinderFeeValidator } from "./finder-fee-validator.js";

// ---------------------------------------------------------------------------
// Mock logger to prevent console noise during tests
// ---------------------------------------------------------------------------
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(body: unknown, headers: Record<string, string> = {}) {
  return { body, headers, ip: "127.0.0.1", url: "/test", method: "POST" } as any;
}

function createMockReply() {
  const state = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, unknown> };
  const reply: any = {
    code: (c: number) => { state.statusCode = c; return reply; },
    send: (b: unknown) => { state.body = b; return reply; },
    header: (n: string, v: unknown) => { state.headers[n] = v; return reply; },
  };
  Object.defineProperty(reply, "_state", { get: () => state });
  return reply;
}

/**
 * Build a valid order body with finder fee fields for a given action.
 */
function buildOrderBody(
  action: string,
  overrides: {
    feeType?: string;
    feeAmount?: string;
    settlementDetails?: Array<Record<string, unknown>> | null;
    omitPayment?: boolean;
    omitFeeType?: boolean;
    omitFeeAmount?: boolean;
  } = {},
) {
  const {
    feeType = "percent",
    feeAmount = "5",
    settlementDetails,
    omitPayment = false,
    omitFeeType = false,
    omitFeeAmount = false,
  } = overrides;

  const payment: Record<string, unknown> = {};
  if (!omitFeeType) {
    payment["@ondc/org/buyer_app_finder_fee_type"] = feeType;
  }
  if (!omitFeeAmount) {
    payment["@ondc/org/buyer_app_finder_fee_amount"] = feeAmount;
  }
  if (settlementDetails !== undefined) {
    if (settlementDetails !== null) {
      payment["@ondc/org/settlement_details"] = settlementDetails;
    }
  }

  return {
    context: { action },
    message: {
      order: omitPayment ? {} : { payment },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFinderFeeValidator", () => {
  it("passes select/init/confirm with valid finder fee", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: false });

    for (const action of ["select", "init", "confirm"]) {
      const request = createMockRequest(buildOrderBody(action));
      const reply = createMockReply();

      await handler(request, reply);

      expect(reply._state.statusCode).toBe(200);
      expect(reply._state.body).toBeUndefined();
    }
  });

  it("skips non-relevant actions (search, on_search, status)", async () => {
    const handler = createFinderFeeValidator();

    for (const action of ["search", "on_search", "status", "on_status", "track", "cancel"]) {
      const request = createMockRequest({
        context: { action },
        // No message/order/payment at all
      });
      const reply = createMockReply();

      await handler(request, reply);

      expect(reply._state.statusCode).toBe(200);
      expect(reply._state.body).toBeUndefined();
    }
  });

  it("blocks missing payment object (400 NACK)", async () => {
    const handler = createFinderFeeValidator();

    const request = createMockRequest(buildOrderBody("select", { omitPayment: true }));
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("Payment object is required"),
        }),
      }),
    );
  });

  it("blocks missing fee type or amount", async () => {
    const handler = createFinderFeeValidator();

    // Missing fee type
    const req1 = createMockRequest(buildOrderBody("select", { omitFeeType: true }));
    const rep1 = createMockReply();
    await handler(req1, rep1);

    expect(rep1._state.statusCode).toBe(400);
    expect(rep1._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("buyer_app_finder_fee_type"),
        }),
      }),
    );

    // Missing fee amount
    const req2 = createMockRequest(buildOrderBody("init", { omitFeeAmount: true }));
    const rep2 = createMockReply();
    await handler(req2, rep2);

    expect(rep2._state.statusCode).toBe(400);
    expect(rep2._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
        }),
      }),
    );
  });

  it('blocks invalid fee type (not "percent" or "amount")', async () => {
    const handler = createFinderFeeValidator();

    const request = createMockRequest(
      buildOrderBody("select", { feeType: "flat" }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining('"flat"'),
        }),
      }),
    );
  });

  it("blocks negative fee amount", async () => {
    const handler = createFinderFeeValidator();

    const request = createMockRequest(
      buildOrderBody("select", { feeAmount: "-5" }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("non-negative"),
        }),
      }),
    );
  });

  it("blocks fee percentage > 100", async () => {
    const handler = createFinderFeeValidator();

    const request = createMockRequest(
      buildOrderBody("select", { feeType: "percent", feeAmount: "150" }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("cannot exceed 100"),
        }),
      }),
    );
  });

  it("blocks confirm without settlement details", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: true });

    // confirm with no settlement details at all
    const request = createMockRequest(
      buildOrderBody("confirm"),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("settlement_details"),
        }),
      }),
    );
  });

  it("blocks settlement detail missing counterparty/type", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: true });

    // Settlement details present but missing required fields
    const request = createMockRequest(
      buildOrderBody("confirm", {
        settlementDetails: [
          { settlement_bank_account_no: "12345" },
        ],
      }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30004",
          message: expect.stringContaining("settlement_counterparty"),
        }),
      }),
    );
  });

  it("passes when enforceSettlement is false", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: false });

    // confirm without settlement details — should pass because enforcement is off
    const request = createMockRequest(
      buildOrderBody("confirm"),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("passes confirm with valid settlement details", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: true });

    const request = createMockRequest(
      buildOrderBody("confirm", {
        settlementDetails: [
          {
            settlement_counterparty: "buyer-app",
            settlement_type: "neft",
            settlement_bank_account_no: "12345678",
            settlement_ifsc_code: "SBIN0000001",
          },
        ],
      }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("accepts fee type 'amount' with valid value", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: false });

    const request = createMockRequest(
      buildOrderBody("select", { feeType: "amount", feeAmount: "25.50" }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });

  it("does not block fee percentage > 100 for fee type 'amount'", async () => {
    const handler = createFinderFeeValidator({ enforceSettlement: false });

    // fee type is "amount", so value 150 is fine (it's a monetary amount, not a percentage)
    const request = createMockRequest(
      buildOrderBody("select", { feeType: "amount", feeAmount: "150" }),
    );
    const reply = createMockReply();

    await handler(request, reply);

    expect(reply._state.statusCode).toBe(200);
    expect(reply._state.body).toBeUndefined();
  });
});
