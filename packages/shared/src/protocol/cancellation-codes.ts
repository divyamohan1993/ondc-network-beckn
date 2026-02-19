// ---------------------------------------------------------------------------
// ONDC Standardized Cancellation Reason Codes
// ---------------------------------------------------------------------------
// Buyer cancellation  : 001-016
// Seller cancellation : 017-020
// ---------------------------------------------------------------------------

/**
 * Category of the cancellation initiator.
 */
export type CancellationCategory = "buyer" | "seller";

/**
 * Union type of all valid cancellation reason code strings.
 */
export type CancellationReasonCode =
  | "001"
  | "002"
  | "003"
  | "004"
  | "005"
  | "006"
  | "007"
  | "008"
  | "009"
  | "010"
  | "011"
  | "012"
  | "013"
  | "014"
  | "015"
  | "016"
  | "017"
  | "018"
  | "019"
  | "020";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface CancellationReasonMeta {
  code: CancellationReasonCode;
  category: CancellationCategory;
  description: string;
}

const CANCELLATION_REASONS: readonly CancellationReasonMeta[] = [
  // ---- Buyer cancellation (001-016) ----------------------------------------
  { code: "001", category: "buyer", description: "Price of item(s) changed" },
  { code: "002", category: "buyer", description: "Delivery time too long" },
  { code: "003", category: "buyer", description: "Found better deal" },
  { code: "004", category: "buyer", description: "Product not needed anymore" },
  { code: "005", category: "buyer", description: "Incorrect product ordered" },
  { code: "006", category: "buyer", description: "Address change required" },
  { code: "007", category: "buyer", description: "Buyer refused delivery" },
  { code: "008", category: "buyer", description: "Delivery date/time changed" },
  { code: "009", category: "buyer", description: "Improper packaging" },
  { code: "010", category: "buyer", description: "Damaged product" },
  { code: "011", category: "buyer", description: "Wrong product delivered" },
  { code: "012", category: "buyer", description: "Duplicate order" },
  { code: "013", category: "buyer", description: "Payment issue" },
  { code: "014", category: "buyer", description: "Merchant not responsive" },
  { code: "015", category: "buyer", description: "Other buyer reason" },
  { code: "016", category: "buyer", description: "Order created by mistake" },

  // ---- Seller cancellation (017-020) ---------------------------------------
  { code: "017", category: "seller", description: "Item out of stock" },
  { code: "018", category: "seller", description: "Cannot service location" },
  { code: "019", category: "seller", description: "Quality check failed" },
  { code: "020", category: "seller", description: "Other seller reason" },
] as const;

/**
 * Set of all valid cancellation reason codes for fast lookup.
 */
const VALID_CODES = new Set<string>(
  CANCELLATION_REASONS.map((r) => r.code),
);

/**
 * Indexed map for O(1) access by code.
 */
const CODE_MAP = new Map<string, CancellationReasonMeta>(
  CANCELLATION_REASONS.map((r) => [r.code, r]),
);

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check whether a string is a valid ONDC cancellation reason code.
 *
 * @param code - The code string to validate (e.g. "001").
 * @returns `true` if the code is a recognised cancellation reason.
 */
export function isValidCancellationCode(code: string): code is CancellationReasonCode {
  return VALID_CODES.has(code);
}

/**
 * Return the cancellation category ("buyer" or "seller") for the given code.
 *
 * @param code - A valid `CancellationReasonCode`.
 * @returns The `CancellationCategory` for the code.
 * @throws If the code is not recognised.
 */
export function getCancellationCategory(code: string): CancellationCategory {
  const meta = CODE_MAP.get(code);
  if (!meta) {
    throw new Error(`Unknown cancellation reason code: ${code}`);
  }
  return meta.category;
}

/**
 * Return the human-readable description for a cancellation reason code.
 *
 * @param code - A valid `CancellationReasonCode`.
 * @returns The description string.
 * @throws If the code is not recognised.
 */
export function getCancellationDescription(code: string): string {
  const meta = CODE_MAP.get(code);
  if (!meta) {
    throw new Error(`Unknown cancellation reason code: ${code}`);
  }
  return meta.description;
}

/**
 * Return all cancellation reasons for a given category.
 *
 * @param category - "buyer" or "seller".
 * @returns Array of `CancellationReasonMeta` entries for that category.
 */
export function getCancellationReasonsByCategory(
  category: CancellationCategory,
): readonly CancellationReasonMeta[] {
  return CANCELLATION_REASONS.filter((r) => r.category === category);
}

/**
 * Return the complete list of cancellation reasons.
 */
export function getAllCancellationReasons(): readonly CancellationReasonMeta[] {
  return CANCELLATION_REASONS;
}
