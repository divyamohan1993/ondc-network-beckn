import { describe, it, expect } from "vitest";
import {
  OrderState,
  isValidOrderTransition,
  getValidNextStates,
  isTerminalState,
  isOrderState,
} from "./order-states.js";

// ---------------------------------------------------------------------------
// isValidOrderTransition - Valid transitions
// ---------------------------------------------------------------------------

describe("isValidOrderTransition - valid transitions", () => {
  it("should allow Created -> Accepted", () => {
    expect(isValidOrderTransition(OrderState.Created, OrderState.Accepted)).toBe(true);
  });

  it("should allow Created -> Cancelled", () => {
    expect(isValidOrderTransition(OrderState.Created, OrderState.Cancelled)).toBe(true);
  });

  it("should allow Accepted -> InProgress", () => {
    expect(isValidOrderTransition(OrderState.Accepted, OrderState.InProgress)).toBe(true);
  });

  it("should allow Accepted -> Cancelled", () => {
    expect(isValidOrderTransition(OrderState.Accepted, OrderState.Cancelled)).toBe(true);
  });

  it("should allow InProgress -> Completed", () => {
    expect(isValidOrderTransition(OrderState.InProgress, OrderState.Completed)).toBe(true);
  });

  it("should allow InProgress -> Cancelled", () => {
    expect(isValidOrderTransition(OrderState.InProgress, OrderState.Cancelled)).toBe(true);
  });

  it("should allow InProgress -> Returned", () => {
    expect(isValidOrderTransition(OrderState.InProgress, OrderState.Returned)).toBe(true);
  });

  it("should allow Completed -> Returned", () => {
    expect(isValidOrderTransition(OrderState.Completed, OrderState.Returned)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidOrderTransition - Invalid transitions
// ---------------------------------------------------------------------------

describe("isValidOrderTransition - invalid transitions", () => {
  it("should reject Created -> Completed (skips Accepted/InProgress)", () => {
    expect(isValidOrderTransition(OrderState.Created, OrderState.Completed)).toBe(false);
  });

  it("should reject Created -> InProgress (skips Accepted)", () => {
    expect(isValidOrderTransition(OrderState.Created, OrderState.InProgress)).toBe(false);
  });

  it("should reject Cancelled -> Accepted (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Accepted)).toBe(false);
  });

  it("should reject Cancelled -> Created (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Created)).toBe(false);
  });

  it("should reject Cancelled -> InProgress (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Cancelled, OrderState.InProgress)).toBe(false);
  });

  it("should reject Cancelled -> Completed (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Completed)).toBe(false);
  });

  it("should reject Cancelled -> Returned (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Returned)).toBe(false);
  });

  it("should reject Returned -> Created (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Returned, OrderState.Created)).toBe(false);
  });

  it("should reject Returned -> Accepted (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Returned, OrderState.Accepted)).toBe(false);
  });

  it("should reject Returned -> InProgress (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Returned, OrderState.InProgress)).toBe(false);
  });

  it("should reject Returned -> Completed (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Returned, OrderState.Completed)).toBe(false);
  });

  it("should reject Returned -> Cancelled (terminal state)", () => {
    expect(isValidOrderTransition(OrderState.Returned, OrderState.Cancelled)).toBe(false);
  });

  it("should reject Completed -> Cancelled (not allowed)", () => {
    expect(isValidOrderTransition(OrderState.Completed, OrderState.Cancelled)).toBe(false);
  });

  it("should reject Completed -> Created (not allowed)", () => {
    expect(isValidOrderTransition(OrderState.Completed, OrderState.Created)).toBe(false);
  });

  it("should reject Completed -> InProgress (not allowed)", () => {
    expect(isValidOrderTransition(OrderState.Completed, OrderState.InProgress)).toBe(false);
  });

  it("should reject self-transition Created -> Created", () => {
    expect(isValidOrderTransition(OrderState.Created, OrderState.Created)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getValidNextStates
// ---------------------------------------------------------------------------

describe("getValidNextStates", () => {
  it("should return [Accepted, Cancelled] for Created", () => {
    const states = getValidNextStates(OrderState.Created);
    expect(states).toContain(OrderState.Accepted);
    expect(states).toContain(OrderState.Cancelled);
    expect(states).toHaveLength(2);
  });

  it("should return [InProgress, Cancelled] for Accepted", () => {
    const states = getValidNextStates(OrderState.Accepted);
    expect(states).toContain(OrderState.InProgress);
    expect(states).toContain(OrderState.Cancelled);
    expect(states).toHaveLength(2);
  });

  it("should return [Completed, Cancelled, Returned] for InProgress", () => {
    const states = getValidNextStates(OrderState.InProgress);
    expect(states).toContain(OrderState.Completed);
    expect(states).toContain(OrderState.Cancelled);
    expect(states).toContain(OrderState.Returned);
    expect(states).toHaveLength(3);
  });

  it("should return [Returned] for Completed", () => {
    const states = getValidNextStates(OrderState.Completed);
    expect(states).toContain(OrderState.Returned);
    expect(states).toHaveLength(1);
  });

  it("should return an empty array for Cancelled (terminal)", () => {
    const states = getValidNextStates(OrderState.Cancelled);
    expect(states).toHaveLength(0);
  });

  it("should return an empty array for Returned (terminal)", () => {
    const states = getValidNextStates(OrderState.Returned);
    expect(states).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isTerminalState
// ---------------------------------------------------------------------------

describe("isTerminalState", () => {
  it("should return true for Cancelled", () => {
    expect(isTerminalState(OrderState.Cancelled)).toBe(true);
  });

  it("should return true for Returned", () => {
    expect(isTerminalState(OrderState.Returned)).toBe(true);
  });

  it("should return false for Created", () => {
    expect(isTerminalState(OrderState.Created)).toBe(false);
  });

  it("should return false for Accepted", () => {
    expect(isTerminalState(OrderState.Accepted)).toBe(false);
  });

  it("should return false for InProgress", () => {
    expect(isTerminalState(OrderState.InProgress)).toBe(false);
  });

  it("should return false for Completed", () => {
    expect(isTerminalState(OrderState.Completed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOrderState
// ---------------------------------------------------------------------------

describe("isOrderState", () => {
  it('should return true for "Created"', () => {
    expect(isOrderState("Created")).toBe(true);
  });

  it('should return true for "Accepted"', () => {
    expect(isOrderState("Accepted")).toBe(true);
  });

  it('should return true for "In-progress"', () => {
    expect(isOrderState("In-progress")).toBe(true);
  });

  it('should return true for "Completed"', () => {
    expect(isOrderState("Completed")).toBe(true);
  });

  it('should return true for "Cancelled"', () => {
    expect(isOrderState("Cancelled")).toBe(true);
  });

  it('should return true for "Returned"', () => {
    expect(isOrderState("Returned")).toBe(true);
  });

  it("should return false for an empty string", () => {
    expect(isOrderState("")).toBe(false);
  });

  it("should return false for an unknown string", () => {
    expect(isOrderState("Pending")).toBe(false);
  });

  it("should return false for a lowercase variant", () => {
    expect(isOrderState("created")).toBe(false);
  });

  it("should return false for an uppercase variant", () => {
    expect(isOrderState("CANCELLED")).toBe(false);
  });
});
