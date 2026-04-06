/**
 * Consumer Protection Act 2019 & E-Commerce Rules 2020 Compliance
 *
 * Key requirements for e-commerce entities:
 * - Display seller details (name, address, contact)
 * - Transparent pricing (no hidden charges)
 * - Easy cancellation and refund mechanism
 * - Grievance redressal with designated officer
 * - No unfair trade practices
 * - Product origin/country of origin mandatory
 * - MRP display mandatory for packaged goods
 * - Return/refund policy must be clearly stated
 */

import { createLogger } from "../utils/logger.js";

const logger = createLogger("consumer-protection");

// -------------------------------------------------------------------------
// Seller Disclosure (E-Commerce Rules 2020, Rule 5)
// -------------------------------------------------------------------------

export interface SellerDisclosure {
  legalName: string;
  registeredAddress: string;
  contactNumber: string;
  email: string;
  gstin?: string;
  fssaiLicenseNo?: string; // Required for food items
  panNumber?: string;
  returnPolicy: string;
  refundPolicy: string;
  shippingPolicy: string;
  grievanceOfficer: {
    name: string;
    designation: string;
    contact: string;
  };
}

// -------------------------------------------------------------------------
// Product Compliance (Consumer Protection Act 2019)
// -------------------------------------------------------------------------

export interface ProductCompliance {
  countryOfOrigin: string; // Mandatory per E-Commerce Rules 2020
  mrp?: number;           // Maximum Retail Price (mandatory for packaged goods)
  manufactureDate?: string;
  expiryDate?: string;
  netQuantity?: string;
  manufacturer: string;
  importerDetails?: string; // Required if imported product
}

// -------------------------------------------------------------------------
// Validation Functions
// -------------------------------------------------------------------------

/**
 * Validate seller disclosure completeness per E-Commerce Rules 2020 Rule 5.
 */
export function validateSellerDisclosure(seller: Partial<SellerDisclosure>): {
  valid: boolean;
  missing: string[];
} {
  const required: (keyof SellerDisclosure)[] = [
    "legalName",
    "registeredAddress",
    "contactNumber",
    "email",
    "returnPolicy",
    "refundPolicy",
    "grievanceOfficer",
  ];
  const missing = required.filter((field) => !seller[field]);

  // Validate grievance officer sub-fields if present
  if (seller.grievanceOfficer) {
    if (!seller.grievanceOfficer.name)
      missing.push("grievanceOfficer.name" as keyof SellerDisclosure);
    if (!seller.grievanceOfficer.designation)
      missing.push("grievanceOfficer.designation" as keyof SellerDisclosure);
    if (!seller.grievanceOfficer.contact)
      missing.push("grievanceOfficer.contact" as keyof SellerDisclosure);
  }

  if (missing.length > 0) {
    logger.warn(
      { missing },
      "Seller disclosure incomplete per E-Commerce Rules 2020",
    );
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Validate product compliance per Consumer Protection Act 2019 and
 * Legal Metrology (Packaged Commodities) Rules.
 */
export function validateProductCompliance(
  product: Partial<ProductCompliance>,
): {
  valid: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!product.countryOfOrigin)
    missing.push("countryOfOrigin (mandatory per E-Commerce Rules 2020)");
  if (!product.manufacturer) missing.push("manufacturer");

  if (product.expiryDate) {
    const expiry = new Date(product.expiryDate);
    const now = new Date();
    if (expiry < now) {
      warnings.push("Product has expired");
    } else {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      if (expiry < thirtyDays) {
        warnings.push("Product expires within 30 days");
      }
    }
  }

  if (product.mrp !== undefined && product.mrp <= 0) {
    missing.push("MRP must be positive");
  }

  return { valid: missing.length === 0, missing, warnings };
}

// -------------------------------------------------------------------------
// Refund Processing (Consumer Protection Act 2019)
// -------------------------------------------------------------------------

/**
 * Maximum days to process refund after return receipt per Consumer Protection Act.
 */
export const MAX_REFUND_PROCESSING_DAYS = 14;

/**
 * Calculate the refund processing deadline.
 */
export function getRefundDeadline(returnReceivedAt: Date): Date {
  const deadline = new Date(returnReceivedAt);
  deadline.setDate(deadline.getDate() + MAX_REFUND_PROCESSING_DAYS);
  return deadline;
}

// -------------------------------------------------------------------------
// Cancellation Rights
// -------------------------------------------------------------------------

/**
 * Consumers can cancel before dispatch per Consumer Protection Act 2019.
 * E-commerce platforms must allow cancellation until order is shipped.
 */
export const CANCELLATION_WINDOW_BEFORE_DISPATCH = true;

// -------------------------------------------------------------------------
// Unfair Trade Practice Checks (Section 2(47))
// -------------------------------------------------------------------------

/**
 * Flags that indicate potential unfair trade practices per Section 2(47).
 * These should be monitored in product listings.
 */
export const UNFAIR_TRADE_PRACTICE_INDICATORS = [
  "false_representation_of_standard",
  "misleading_price_representation",
  "selling_above_mrp",
  "bait_and_switch",
  "hidden_charges",
  "false_warranty_claims",
  "deceptive_advertising",
] as const;

/**
 * Validate that selling price does not exceed MRP.
 * Selling above MRP is illegal per Legal Metrology Act 2009.
 */
export function validatePriceAgainstMrp(
  sellingPrice: number,
  mrp: number,
): { valid: boolean; violation?: string } {
  if (sellingPrice > mrp) {
    return {
      valid: false,
      violation:
        "Selling price exceeds MRP. Illegal under Legal Metrology Act 2009, Section 36",
    };
  }
  return { valid: true };
}

// -------------------------------------------------------------------------
// Grievance Acknowledgement Timelines (E-Commerce Rules 2020)
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// FSSAI License Validation (FSSAI Act 2006)
// -------------------------------------------------------------------------

/**
 * Valid FSSAI license type prefixes (digits 1-2).
 * 10 = Central License
 * 11 = State License
 * 12 = Registration
 * 20 = Central Manufacturing
 * 21 = State Manufacturing
 */
const FSSAI_LICENSE_TYPES: Record<string, string> = {
  "10": "Central License",
  "11": "State License",
  "12": "Registration",
  "20": "Central Manufacturing",
  "21": "State Manufacturing",
};

/**
 * Valid Indian state codes for FSSAI (digits 3-4).
 * These correspond to the state numbering used by FSSAI,
 * which aligns with the GST state code system.
 */
const VALID_FSSAI_STATE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
  "31", "32", "33", "34", "35", "36", "37", "38",
]);

export interface FssaiValidationResult {
  valid: boolean;
  licenseType?: string;
  stateCode?: string;
  yearOfIssue?: string;
  errors: string[];
}

/**
 * Validate FSSAI license number format with structural breakdown.
 *
 * FSSAI license number is 14 digits:
 * - Digits 1-2: License type (10=Central, 11=State, 12=Registration, etc.)
 * - Digits 3-4: State code
 * - Digits 5-6: Year of issue (YY)
 * - Digits 7-14: Serial number
 *
 * @param license - 14-digit FSSAI license number
 * @returns Validation result with parsed components
 */
export function validateFssaiLicense(license: string): FssaiValidationResult {
  const errors: string[] = [];

  if (!license || !/^[0-9]{14}$/.test(license)) {
    return { valid: false, errors: ["FSSAI license must be exactly 14 digits"] };
  }

  const licenseTypeCode = license.substring(0, 2);
  const stateCode = license.substring(2, 4);
  const yearOfIssue = license.substring(4, 6);

  const licenseType = FSSAI_LICENSE_TYPES[licenseTypeCode];
  if (!licenseType) {
    errors.push(
      `Invalid FSSAI license type: ${licenseTypeCode}. Valid types: ${Object.entries(FSSAI_LICENSE_TYPES)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }

  if (!VALID_FSSAI_STATE_CODES.has(stateCode)) {
    errors.push(`Invalid state code in FSSAI license: ${stateCode}`);
  }

  // Year sanity check: should be between 2006 (FSSAI Act) and current year
  const yearNum = parseInt(yearOfIssue, 10);
  const currentYearShort = new Date().getFullYear() % 100;
  if (yearNum > currentYearShort && yearNum < 80) {
    // Allow future dates up to current year, and old dates 80-99 for legacy
    errors.push(`Suspicious year of issue in FSSAI license: 20${yearOfIssue}`);
  }

  return {
    valid: errors.length === 0,
    licenseType,
    stateCode: errors.length === 0 ? stateCode : undefined,
    yearOfIssue: errors.length === 0 ? `20${yearOfIssue}` : undefined,
    errors,
  };
}

// -------------------------------------------------------------------------
// Grievance Timelines (E-Commerce Rules 2020)
// -------------------------------------------------------------------------

/** Grievance must be acknowledged within 48 hours. */
export const GRIEVANCE_ACK_HOURS = 48;

/** Grievance must be resolved within 30 days (1 month). */
export const GRIEVANCE_RESOLUTION_DAYS = 30;
