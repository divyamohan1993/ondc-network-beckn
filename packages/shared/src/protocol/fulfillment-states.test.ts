import { describe, it, expect } from "vitest";
import {
  FulfillmentState,
  isValidFulfillmentTransition,
  getValidNextFulfillmentStates,
  isFulfillmentState,
} from "./fulfillment-states.js";

// ---------------------------------------------------------------------------
// P2P valid transitions
// ---------------------------------------------------------------------------

describe("isValidFulfillmentTransition - P2P valid transitions", () => {
  it("should allow Pending -> Packed", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.Packed, "P2P")).toBe(true);
  });

  it("should allow Pending -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.Cancelled, "P2P")).toBe(true);
  });

  it("should allow Packed -> AgentAssigned", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Packed, FulfillmentState.AgentAssigned, "P2P")).toBe(true);
  });

  it("should allow Packed -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Packed, FulfillmentState.Cancelled, "P2P")).toBe(true);
  });

  it("should allow AgentAssigned -> OrderPickedUp", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AgentAssigned, FulfillmentState.OrderPickedUp, "P2P")).toBe(true);
  });

  it("should allow AgentAssigned -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AgentAssigned, FulfillmentState.Cancelled, "P2P")).toBe(true);
  });

  it("should allow OrderPickedUp -> OutForDelivery", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderPickedUp, FulfillmentState.OutForDelivery, "P2P")).toBe(true);
  });

  it("should allow OrderPickedUp -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderPickedUp, FulfillmentState.Cancelled, "P2P")).toBe(true);
  });

  it("should allow OrderPickedUp -> RTO", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderPickedUp, FulfillmentState.RTO, "P2P")).toBe(true);
  });

  it("should allow OutForDelivery -> OrderDelivered", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OutForDelivery, FulfillmentState.OrderDelivered, "P2P")).toBe(true);
  });

  it("should allow OutForDelivery -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OutForDelivery, FulfillmentState.Cancelled, "P2P")).toBe(true);
  });

  it("should allow OutForDelivery -> RTO", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OutForDelivery, FulfillmentState.RTO, "P2P")).toBe(true);
  });

  it("should allow RTO -> RTODelivered", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.RTO, FulfillmentState.RTODelivered, "P2P")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P2H2P valid transitions (including hub-specific states)
// ---------------------------------------------------------------------------

describe("isValidFulfillmentTransition - P2H2P valid transitions", () => {
  it("should allow Pending -> Packed", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.Packed, "P2H2P")).toBe(true);
  });

  it("should allow OrderPickedUp -> InTransit", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderPickedUp, FulfillmentState.InTransit, "P2H2P")).toBe(true);
  });

  it("should allow InTransit -> AtDestinationHub", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.InTransit, FulfillmentState.AtDestinationHub, "P2H2P")).toBe(true);
  });

  it("should allow InTransit -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.InTransit, FulfillmentState.Cancelled, "P2H2P")).toBe(true);
  });

  it("should allow InTransit -> RTO", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.InTransit, FulfillmentState.RTO, "P2H2P")).toBe(true);
  });

  it("should allow AtDestinationHub -> OutForDelivery", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AtDestinationHub, FulfillmentState.OutForDelivery, "P2H2P")).toBe(true);
  });

  it("should allow AtDestinationHub -> Cancelled", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AtDestinationHub, FulfillmentState.Cancelled, "P2H2P")).toBe(true);
  });

  it("should allow AtDestinationHub -> RTO", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AtDestinationHub, FulfillmentState.RTO, "P2H2P")).toBe(true);
  });

  it("should allow OutForDelivery -> OrderDelivered in P2H2P", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OutForDelivery, FulfillmentState.OrderDelivered, "P2H2P")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions
// ---------------------------------------------------------------------------

describe("isValidFulfillmentTransition - invalid transitions", () => {
  it("should reject Pending -> OrderDelivered (skips steps)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.OrderDelivered, "P2P")).toBe(false);
  });

  it("should reject OrderDelivered -> Pending (terminal state)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderDelivered, FulfillmentState.Pending, "P2P")).toBe(false);
  });

  it("should reject Cancelled -> Packed (terminal state)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Cancelled, FulfillmentState.Packed, "P2P")).toBe(false);
  });

  it("should reject RTODelivered -> anything (terminal state)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.RTODelivered, FulfillmentState.Pending, "P2P")).toBe(false);
  });

  it("should reject self-transition Pending -> Pending", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.Pending, "P2P")).toBe(false);
  });

  it("should reject backward transition AgentAssigned -> Packed", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AgentAssigned, FulfillmentState.Packed, "P2P")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2P transitions that are only valid in P2H2P
// ---------------------------------------------------------------------------

describe("isValidFulfillmentTransition - P2H2P-only transitions rejected in P2P", () => {
  it("should reject OrderPickedUp -> InTransit in P2P", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.OrderPickedUp, FulfillmentState.InTransit, "P2P")).toBe(false);
  });

  it("should reject InTransit -> AtDestinationHub in P2P (InTransit has no transitions in P2P)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.InTransit, FulfillmentState.AtDestinationHub, "P2P")).toBe(false);
  });

  it("should reject AtDestinationHub -> OutForDelivery in P2P (AtDestinationHub has no transitions in P2P)", () => {
    expect(isValidFulfillmentTransition(FulfillmentState.AtDestinationHub, FulfillmentState.OutForDelivery, "P2P")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isFulfillmentState
// ---------------------------------------------------------------------------

describe("isFulfillmentState", () => {
  it("should return true for 'Pending'", () => {
    expect(isFulfillmentState("Pending")).toBe(true);
  });

  it("should return true for 'Packed'", () => {
    expect(isFulfillmentState("Packed")).toBe(true);
  });

  it("should return true for 'Agent-assigned'", () => {
    expect(isFulfillmentState("Agent-assigned")).toBe(true);
  });

  it("should return true for 'Order-picked-up'", () => {
    expect(isFulfillmentState("Order-picked-up")).toBe(true);
  });

  it("should return true for 'In-transit'", () => {
    expect(isFulfillmentState("In-transit")).toBe(true);
  });

  it("should return true for 'At-destination-hub'", () => {
    expect(isFulfillmentState("At-destination-hub")).toBe(true);
  });

  it("should return true for 'Out-for-delivery'", () => {
    expect(isFulfillmentState("Out-for-delivery")).toBe(true);
  });

  it("should return true for 'Order-delivered'", () => {
    expect(isFulfillmentState("Order-delivered")).toBe(true);
  });

  it("should return true for 'Cancelled'", () => {
    expect(isFulfillmentState("Cancelled")).toBe(true);
  });

  it("should return true for 'RTO-Initiated'", () => {
    expect(isFulfillmentState("RTO-Initiated")).toBe(true);
  });

  it("should return true for 'RTO-Delivered'", () => {
    expect(isFulfillmentState("RTO-Delivered")).toBe(true);
  });

  it("should return false for empty string", () => {
    expect(isFulfillmentState("")).toBe(false);
  });

  it("should return false for unknown string", () => {
    expect(isFulfillmentState("Shipped")).toBe(false);
  });

  it("should return false for lowercase variant", () => {
    expect(isFulfillmentState("pending")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Terminal states have no valid next states
// ---------------------------------------------------------------------------

describe("getValidNextFulfillmentStates - terminal states", () => {
  it("should return empty array for OrderDelivered", () => {
    expect(getValidNextFulfillmentStates(FulfillmentState.OrderDelivered, "P2P")).toHaveLength(0);
  });

  it("should return empty array for Cancelled", () => {
    expect(getValidNextFulfillmentStates(FulfillmentState.Cancelled, "P2P")).toHaveLength(0);
  });

  it("should return empty array for RTODelivered", () => {
    expect(getValidNextFulfillmentStates(FulfillmentState.RTODelivered, "P2P")).toHaveLength(0);
  });

  it("should return empty array for InTransit in P2P mode", () => {
    expect(getValidNextFulfillmentStates(FulfillmentState.InTransit, "P2P")).toHaveLength(0);
  });

  it("should return non-empty array for InTransit in P2H2P mode", () => {
    const states = getValidNextFulfillmentStates(FulfillmentState.InTransit, "P2H2P");
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain(FulfillmentState.AtDestinationHub);
  });
});

// ---------------------------------------------------------------------------
// Cancelled is reachable from most non-terminal states
// ---------------------------------------------------------------------------

describe("Cancelled reachable from non-terminal states", () => {
  const nonTerminalStates = [
    FulfillmentState.Pending,
    FulfillmentState.Packed,
    FulfillmentState.AgentAssigned,
    FulfillmentState.OrderPickedUp,
    FulfillmentState.OutForDelivery,
  ];

  for (const state of nonTerminalStates) {
    it(`should allow ${state} -> Cancelled in P2P`, () => {
      expect(isValidFulfillmentTransition(state, FulfillmentState.Cancelled, "P2P")).toBe(true);
    });
  }

  const p2h2pExtraStates = [
    FulfillmentState.InTransit,
    FulfillmentState.AtDestinationHub,
  ];

  for (const state of p2h2pExtraStates) {
    it(`should allow ${state} -> Cancelled in P2H2P`, () => {
      expect(isValidFulfillmentTransition(state, FulfillmentState.Cancelled, "P2H2P")).toBe(true);
    });
  }
});
