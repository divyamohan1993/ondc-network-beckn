// ---------------------------------------------------------------------------
// ONDC Order State Machine
// ---------------------------------------------------------------------------

/**
 * Enumeration of all valid ONDC order states.
 */
export enum OrderState {
  Created = "Created",
  Accepted = "Accepted",
  InProgress = "In-progress",
  Completed = "Completed",
  Cancelled = "Cancelled",
  Returned = "Returned",
}

// ---------------------------------------------------------------------------
// Transition rules
// ---------------------------------------------------------------------------

/**
 * Map of each order state to the set of states it may transition to.
 *
 * Rules:
 *   Created     -> Accepted, Cancelled
 *   Accepted    -> In-progress, Cancelled
 *   In-progress -> Completed, Cancelled, Returned
 *   Completed   -> Returned
 *   Cancelled   -> (terminal - no valid next states)
 *   Returned    -> (terminal - no valid next states)
 */
const TRANSITION_MAP: Readonly<Record<OrderState, ReadonlySet<OrderState>>> = {
  [OrderState.Created]: new Set([
    OrderState.Accepted,
    OrderState.Cancelled,
  ]),
  [OrderState.Accepted]: new Set([
    OrderState.InProgress,
    OrderState.Cancelled,
  ]),
  [OrderState.InProgress]: new Set([
    OrderState.Completed,
    OrderState.Cancelled,
    OrderState.Returned,
  ]),
  [OrderState.Completed]: new Set([
    OrderState.Returned,
  ]),
  [OrderState.Cancelled]: new Set<OrderState>(),
  [OrderState.Returned]: new Set<OrderState>(),
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check whether a transition from one order state to another is valid
 * according to the ONDC order state machine.
 *
 * @param from - The current order state.
 * @param to - The desired next state.
 * @returns `true` if the transition is permitted.
 */
export function isValidOrderTransition(from: OrderState, to: OrderState): boolean {
  const allowed = TRANSITION_MAP[from];
  return allowed ? allowed.has(to) : false;
}

/**
 * Return the set of states that the order can transition to from the given
 * current state.
 *
 * @param current - The current order state.
 * @returns Array of valid next `OrderState` values (may be empty for terminal states).
 */
export function getValidNextStates(current: OrderState): OrderState[] {
  const allowed = TRANSITION_MAP[current];
  return allowed ? Array.from(allowed) : [];
}

/**
 * Check whether the given state is a terminal (final) state.
 *
 * @param state - The order state to check.
 * @returns `true` if no further transitions are possible.
 */
export function isTerminalState(state: OrderState): boolean {
  return getValidNextStates(state).length === 0;
}

/**
 * Type guard to check if a string is a valid `OrderState` value.
 *
 * @param value - The string to check.
 * @returns `true` if the string corresponds to an `OrderState` enum member.
 */
export function isOrderState(value: string): value is OrderState {
  return Object.values(OrderState).includes(value as OrderState);
}
