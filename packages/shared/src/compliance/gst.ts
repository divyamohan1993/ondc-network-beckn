/**
 * GST (Goods and Services Tax) Compliance
 * Required for all e-commerce transactions in India.
 *
 * Key statutes:
 * - CGST Act 2017
 * - IGST Act 2017
 * - GST (TCS) provisions for e-commerce operators (Section 52 CGST Act)
 */

// -------------------------------------------------------------------------
// GSTIN Details
// -------------------------------------------------------------------------

export interface GstDetails {
  gstin: string; // 15-character GSTIN
  legalName: string;
  tradeName?: string;
  registeredState: string;
  gstCategory: "REGISTERED" | "COMPOSITION" | "UNREGISTERED" | "UIN";
}

// -------------------------------------------------------------------------
// GSTIN Validation
// -------------------------------------------------------------------------

/**
 * Validate GSTIN format.
 * Format: 2-digit state code + 10-digit PAN + 1 entity number + Z + 1 check digit
 * Example: 27AAPFU0939F1ZV
 */
export function validateGstin(gstin: string): boolean {
  if (!gstin || gstin.length !== 15) return false;
  const gstinRegex =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin);
}

/**
 * Extract state code from GSTIN (first 2 digits).
 */
export function getStateFromGstin(gstin: string): string | null {
  if (!validateGstin(gstin)) return null;
  return gstin.substring(0, 2);
}

/**
 * Extract PAN from GSTIN (characters 3-12).
 */
export function getPanFromGstin(gstin: string): string | null {
  if (!validateGstin(gstin)) return null;
  return gstin.substring(2, 12);
}

// -------------------------------------------------------------------------
// GST Rate Schedule
// -------------------------------------------------------------------------

/** Standard GST rate slabs in India. */
export const GST_RATES = {
  EXEMPT: 0,
  ESSENTIAL: 5,  // Essential goods (basic food, medicines)
  STANDARD: 12,  // Standard goods
  GENERAL: 18,   // General goods and services
  LUXURY: 28,    // Luxury goods, sin goods (tobacco, aerated drinks)
} as const;

export type GstRateCategory = keyof typeof GST_RATES;

// -------------------------------------------------------------------------
// GST Calculation
// -------------------------------------------------------------------------

export interface GstBreakup {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalWithTax: number;
}

/**
 * Calculate GST breakup from taxable amount.
 * Inter-state = IGST. Intra-state = CGST + SGST (split equally).
 */
export function calculateGstBreakup(params: {
  amount: number;
  gstRate: number;
  isInterState: boolean;
}): GstBreakup {
  const taxableAmount = params.amount;
  const totalTax = (taxableAmount * params.gstRate) / 100;

  if (params.isInterState) {
    return {
      taxableAmount,
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      totalTax,
      totalWithTax: taxableAmount + totalTax,
    };
  }

  return {
    taxableAmount,
    cgst: totalTax / 2,
    sgst: totalTax / 2,
    igst: 0,
    totalTax,
    totalWithTax: taxableAmount + totalTax,
  };
}

/**
 * Reverse-calculate GST from a tax-inclusive amount.
 * Useful for extracting tax component from MRP.
 */
export function reverseCalculateGst(params: {
  amountInclTax: number;
  gstRate: number;
  isInterState: boolean;
}): GstBreakup {
  const taxableAmount =
    (params.amountInclTax * 100) / (100 + params.gstRate);
  const totalTax = params.amountInclTax - taxableAmount;

  if (params.isInterState) {
    return {
      taxableAmount,
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      totalTax,
      totalWithTax: params.amountInclTax,
    };
  }

  return {
    taxableAmount,
    cgst: totalTax / 2,
    sgst: totalTax / 2,
    igst: 0,
    totalTax,
    totalWithTax: params.amountInclTax,
  };
}

// -------------------------------------------------------------------------
// HSN / SAC Code Validation
// -------------------------------------------------------------------------

/**
 * Validate HSN (Harmonized System of Nomenclature) code for goods.
 * HSN codes are 4, 6, or 8 digits.
 */
export function validateHsnCode(code: string): boolean {
  return /^[0-9]{4}([0-9]{2})?([0-9]{2})?$/.test(code);
}

/**
 * Validate SAC (Services Accounting Code) for services.
 * SAC codes are 6 digits, starting with 99.
 */
export function validateSacCode(code: string): boolean {
  return /^99[0-9]{4}$/.test(code);
}

// -------------------------------------------------------------------------
// TCS (Tax Collected at Source) for E-Commerce (Section 52 CGST Act)
// -------------------------------------------------------------------------

/**
 * TCS rate for e-commerce operators.
 * E-commerce operators must collect TCS at 1% (0.5% CGST + 0.5% SGST
 * for intra-state, 1% IGST for inter-state) on net taxable supplies.
 */
export const TCS_RATE_PERCENT = 1;

/**
 * Calculate TCS amount for an e-commerce transaction.
 */
export function calculateTcs(params: {
  netTaxableSupply: number;
  isInterState: boolean;
}): { tcsAmount: number; cgstTcs: number; sgstTcs: number; igstTcs: number } {
  const tcsAmount = (params.netTaxableSupply * TCS_RATE_PERCENT) / 100;

  if (params.isInterState) {
    return { tcsAmount, cgstTcs: 0, sgstTcs: 0, igstTcs: tcsAmount };
  }

  return {
    tcsAmount,
    cgstTcs: tcsAmount / 2,
    sgstTcs: tcsAmount / 2,
    igstTcs: 0,
  };
}

// -------------------------------------------------------------------------
// Indian State Codes (for GSTIN first 2 digits)
// -------------------------------------------------------------------------

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman & Diu",
  "26": "Dadra & Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (before bifurcation)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};
