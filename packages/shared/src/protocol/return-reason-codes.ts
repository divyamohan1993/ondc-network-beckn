// ---------------------------------------------------------------------------
// ONDC Standardized Return Reason Codes
// ---------------------------------------------------------------------------
// Buyer return    : 001-008
// Seller return   : 009-011
// ---------------------------------------------------------------------------

/**
 * Category of the return initiator.
 */
export type ReturnCategory = "buyer" | "seller";

/**
 * Union type of all valid return reason code strings.
 */
export type ReturnReasonCode =
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
  | "011";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface ReturnReasonMeta {
  code: ReturnReasonCode;
  category: ReturnCategory;
  description: string;
}

const RETURN_REASONS: readonly ReturnReasonMeta[] = [
  // ---- Buyer return reasons (001-008) ----------------------------------------
  { code: "001", category: "buyer", description: "Buyer does not want the product" },
  { code: "002", category: "buyer", description: "Product was damaged at the time of delivery" },
  { code: "003", category: "buyer", description: "Product is different from what was shown on the app" },
  { code: "004", category: "buyer", description: "Product is of bad quality" },
  { code: "005", category: "buyer", description: "Wrong product was delivered" },
  { code: "006", category: "buyer", description: "Product has expired" },
  { code: "007", category: "buyer", description: "Product was delivered late" },
  { code: "008", category: "buyer", description: "Product packaging was tampered" },

  // ---- Seller return reasons (009-011) ---------------------------------------
  { code: "009", category: "seller", description: "Product sent for quality check failed" },
  { code: "010", category: "seller", description: "Product could not be delivered" },
  { code: "011", category: "seller", description: "Other seller reason" },
] as const;

/**
 * Set of all valid return reason codes for fast lookup.
 */
const VALID_CODES = new Set<string>(
  RETURN_REASONS.map((r) => r.code),
);

/**
 * Indexed map for O(1) access by code.
 */
const CODE_MAP = new Map<string, ReturnReasonMeta>(
  RETURN_REASONS.map((r) => [r.code, r]),
);

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check whether a string is a valid ONDC return reason code.
 *
 * @param code - The code string to validate (e.g. "001").
 * @returns `true` if the code is a recognised return reason.
 */
export function isValidReturnCode(code: string): code is ReturnReasonCode {
  return VALID_CODES.has(code);
}

/**
 * Return the return category ("buyer" or "seller") for the given code.
 *
 * @param code - A valid `ReturnReasonCode`.
 * @returns The `ReturnCategory` for the code.
 * @throws If the code is not recognised.
 */
export function getReturnCategory(code: string): ReturnCategory {
  const meta = CODE_MAP.get(code);
  if (!meta) {
    throw new Error(`Unknown return reason code: ${code}`);
  }
  return meta.category;
}

/**
 * Return the human-readable description for a return reason code.
 *
 * @param code - A valid `ReturnReasonCode`.
 * @returns The description string.
 * @throws If the code is not recognised.
 */
export function getReturnDescription(code: string): string {
  const meta = CODE_MAP.get(code);
  if (!meta) {
    throw new Error(`Unknown return reason code: ${code}`);
  }
  return meta.description;
}

/**
 * Return all return reasons for a given category.
 *
 * @param category - "buyer" or "seller".
 * @returns Array of `ReturnReasonMeta` entries for that category.
 */
export function getReturnReasonsByCategory(
  category: ReturnCategory,
): readonly ReturnReasonMeta[] {
  return RETURN_REASONS.filter((r) => r.category === category);
}

/**
 * Return the complete list of return reasons.
 */
export function getAllReturnReasons(): readonly ReturnReasonMeta[] {
  return RETURN_REASONS;
}
