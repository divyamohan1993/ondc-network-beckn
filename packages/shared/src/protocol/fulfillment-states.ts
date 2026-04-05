// ---------------------------------------------------------------------------
// ONDC v1.2.5 Fulfillment State Machine
// ---------------------------------------------------------------------------

/**
 * Fulfillment states per ONDC v1.2.5 spec.
 *
 * P2P flow:
 *   Pending -> Packed -> Agent-assigned -> Order-picked-up ->
 *   Out-for-delivery -> Order-delivered
 *
 * P2H2P flow:
 *   Pending -> Packed -> Agent-assigned -> Order-picked-up ->
 *   In-transit -> At-destination-hub -> Out-for-delivery -> Order-delivered
 */
export enum FulfillmentState {
  Pending = "Pending",
  Packed = "Packed",
  AgentAssigned = "Agent-assigned",
  OrderPickedUp = "Order-picked-up",
  InTransit = "In-transit",
  AtDestinationHub = "At-destination-hub",
  OutForDelivery = "Out-for-delivery",
  OrderDelivered = "Order-delivered",
  Cancelled = "Cancelled",
  RTO = "RTO-Initiated",
  RTODelivered = "RTO-Delivered",
}

// ---------------------------------------------------------------------------
// Transition rules
// ---------------------------------------------------------------------------

const P2P_TRANSITIONS: Readonly<Record<FulfillmentState, readonly FulfillmentState[]>> = {
  [FulfillmentState.Pending]: [FulfillmentState.Packed, FulfillmentState.Cancelled],
  [FulfillmentState.Packed]: [FulfillmentState.AgentAssigned, FulfillmentState.Cancelled],
  [FulfillmentState.AgentAssigned]: [FulfillmentState.OrderPickedUp, FulfillmentState.Cancelled],
  [FulfillmentState.OrderPickedUp]: [FulfillmentState.OutForDelivery, FulfillmentState.Cancelled, FulfillmentState.RTO],
  [FulfillmentState.OutForDelivery]: [FulfillmentState.OrderDelivered, FulfillmentState.Cancelled, FulfillmentState.RTO],
  [FulfillmentState.OrderDelivered]: [],
  [FulfillmentState.Cancelled]: [],
  [FulfillmentState.InTransit]: [],
  [FulfillmentState.AtDestinationHub]: [],
  [FulfillmentState.RTO]: [FulfillmentState.RTODelivered],
  [FulfillmentState.RTODelivered]: [],
};

const P2H2P_TRANSITIONS: Readonly<Record<FulfillmentState, readonly FulfillmentState[]>> = {
  ...P2P_TRANSITIONS,
  [FulfillmentState.OrderPickedUp]: [FulfillmentState.InTransit, FulfillmentState.Cancelled, FulfillmentState.RTO],
  [FulfillmentState.InTransit]: [FulfillmentState.AtDestinationHub, FulfillmentState.Cancelled, FulfillmentState.RTO],
  [FulfillmentState.AtDestinationHub]: [FulfillmentState.OutForDelivery, FulfillmentState.Cancelled, FulfillmentState.RTO],
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check whether a fulfillment state transition is valid for a given routing type.
 */
export function isValidFulfillmentTransition(
  from: FulfillmentState,
  to: FulfillmentState,
  routingType: "P2P" | "P2H2P" = "P2P",
): boolean {
  const map = routingType === "P2H2P" ? P2H2P_TRANSITIONS : P2P_TRANSITIONS;
  return map[from]?.includes(to) ?? false;
}

/**
 * Return valid next states for a given fulfillment state and routing type.
 */
export function getValidNextFulfillmentStates(
  current: FulfillmentState,
  routingType: "P2P" | "P2H2P" = "P2P",
): FulfillmentState[] {
  const map = routingType === "P2H2P" ? P2H2P_TRANSITIONS : P2P_TRANSITIONS;
  return [...(map[current] ?? [])];
}

/**
 * Type guard: check if a string is a valid FulfillmentState value.
 */
export function isFulfillmentState(value: string): value is FulfillmentState {
  return Object.values(FulfillmentState).includes(value as FulfillmentState);
}
