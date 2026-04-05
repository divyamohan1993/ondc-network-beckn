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

/** Grievance must be acknowledged within 48 hours. */
export const GRIEVANCE_ACK_HOURS = 48;

/** Grievance must be resolved within 30 days (1 month). */
export const GRIEVANCE_RESOLUTION_DAYS = 30;
