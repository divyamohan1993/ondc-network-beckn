import { describe, it, expect, vi } from "vitest";
import { becknErrorHandler } from "./error-handler.js";

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

function createFastifyError(statusCode: number, message: string) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("becknErrorHandler", () => {
  it("maps 400 to CONTEXT-ERROR 10000", () => {
    const error = createFastifyError(400, "Bad request body");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(400);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        message: { ack: { status: "NACK" } },
        error: expect.objectContaining({
          type: "CONTEXT-ERROR",
          code: "10000",
        }),
      }),
    );
  });

  it("maps 401 to CONTEXT-ERROR 10001", () => {
    const error = createFastifyError(401, "Unauthorized");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(401);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "CONTEXT-ERROR",
          code: "10001",
        }),
      }),
    );
  });

  it("maps 403 to POLICY-ERROR 30001", () => {
    const error = createFastifyError(403, "Forbidden");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(403);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "POLICY-ERROR",
          code: "30001",
        }),
      }),
    );
  });

  it("maps 404 to DOMAIN-ERROR 40000", () => {
    const error = createFastifyError(404, "Not found");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(404);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "DOMAIN-ERROR",
          code: "40000",
        }),
      }),
    );
  });

  it("maps 500+ to INTERNAL-ERROR 20000", () => {
    const error = createFastifyError(500, "Unexpected failure");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(500);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "INTERNAL-ERROR",
          code: "20000",
        }),
      }),
    );

    // Also verify 502 maps the same way
    const error502 = createFastifyError(502, "Bad gateway");
    const reply502 = createMockReply();
    becknErrorHandler(error502, createMockRequest({}), reply502);
    expect(reply502._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "INTERNAL-ERROR",
          code: "20000",
        }),
      }),
    );
  });

  it("includes error message for 4xx", () => {
    const error = createFastifyError(400, "Missing required field: context.action");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    const body = reply._state.body as any;
    expect(body.error.message).toBe("Missing required field: context.action");
  });

  it("uses generic message for 5xx", () => {
    const error = createFastifyError(500, "Database connection pool exhausted");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    const body = reply._state.body as any;
    // Should NOT expose internal error details for 5xx
    expect(body.error.message).toBe("Internal server error. Please try again later.");
    expect(body.error.message).not.toContain("Database");
  });

  it("returns proper NACK structure", () => {
    const error = createFastifyError(422, "Validation error");
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    const body = reply._state.body as any;

    // Verify top-level structure
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("error");

    // Verify message.ack.status === "NACK"
    expect(body.message).toEqual({ ack: { status: "NACK" } });

    // Verify error has type, code, message
    expect(body.error).toHaveProperty("type");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("defaults to statusCode 500 when error has no statusCode", () => {
    const error: any = new Error("Something broke");
    // No statusCode property
    const request = createMockRequest({});
    const reply = createMockReply();

    becknErrorHandler(error, request, reply);

    expect(reply._state.statusCode).toBe(500);
    expect(reply._state.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "INTERNAL-ERROR",
          code: "20000",
          message: "Internal server error. Please try again later.",
        }),
      }),
    );
  });
});
