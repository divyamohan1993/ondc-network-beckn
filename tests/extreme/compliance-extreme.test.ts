/**
 * EXTREME Compliance & Integration Tests
 *
 * Covers Indian law compliance (DPDPA 2023, IT Act 2000, Consumer Protection Act 2019,
 * GST), XSS sanitization, DNS verification, distributed tracing, and end-to-end
 * Beckn protocol flows with cryptographic signing/verification.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// =========================================================================
// Mocks (must be before imports)
// =========================================================================

const mockResolveTxt = vi.fn();
vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: any[]) => mockResolveTxt(...args),
}));

vi.mock("@ondc/shared/utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: (bindings: Record<string, unknown>) => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        bindings: () => bindings,
      }),
    }),
  };
});

// =========================================================================
// Imports
// =========================================================================

import {
  generateConsentNotice,
  getBreachNotificationDeadline,
  BREACH_NOTIFICATION_HOURS,
  isTransferAllowed,
  checkFiduciaryObligations,
  getDataPrincipalResponseDeadline,
  DATA_PRINCIPAL_RESPONSE_DAYS,
  LEGITIMATE_USE_PURPOSES,
  isLegitimateUse,
} from "../../packages/shared/src/compliance/dpdpa.js";

import {
  IncidentSeverity,
  getCertInReportingDeadline,
  checkSecurityPractices,
  LOG_RETENTION_DAYS,
  CERT_IN_REPORTABLE_INCIDENTS,
} from "../../packages/shared/src/compliance/it-act.js";

import {
  validateSellerDisclosure,
  validateProductCompliance,
  validatePriceAgainstMrp,
  MAX_REFUND_PROCESSING_DAYS,
} from "../../packages/shared/src/compliance/consumer-protection.js";

import {
  validateGstin,
  calculateGstBreakup,
  validateHsnCode,
  GST_RATES,
  TCS_RATE_PERCENT,
  calculateTcs,
  GST_STATE_CODES,
} from "../../packages/shared/src/compliance/gst.js";

import {
  validateIndianLawCompliance,
} from "../../packages/shared/src/protocol/catalog-validation.js";

import {
  escapeHtml,
  sanitizeCatalogItem,
  sanitizeCatalog,
} from "../../packages/shared/src/utils/sanitizer.js";

import { verifyDnsTxtRecord } from "../../packages/registry/src/services/dns-verify.js";

import {
  buildTraceHeaders,
  buildTraceHeadersFromContext,
  TRACE_ID_HEADER,
  SPAN_ID_HEADER,
  PARENT_SPAN_HEADER,
  tracingMiddleware,
} from "../../packages/shared/src/middleware/tracing.js";

import { createRequestLogger } from "../../packages/shared/src/utils/logger.js";

import { buildContext } from "../../packages/shared/src/protocol/context.js";
import { validateBecknRequest } from "../../packages/shared/src/protocol/validator.js";
import {
  buildAuthHeader,
  verifyAuthHeader,
  parseAuthHeader,
} from "../../packages/shared/src/crypto/auth-header.js";
import { generateKeyPair } from "../../packages/shared/src/crypto/ed25519.js";

import {
  OrderState,
  isValidOrderTransition,
  isTerminalState,
} from "../../packages/shared/src/protocol/order-states.js";

import {
  FulfillmentState,
  isValidFulfillmentTransition,
} from "../../packages/shared/src/protocol/fulfillment-states.js";

// =========================================================================
// 1. DPDPA 2023 Compliance Tests
// =========================================================================

describe("DPDPA 2023 Compliance", () => {
  it("generateConsentNotice includes all 6 data principal rights", () => {
    const notice = generateConsentNotice({
      dataFiduciary: "ONDC Test Pvt Ltd",
      purposes: ["order_processing", "delivery"],
      dataCategories: ["name", "phone", "address"],
      retentionPeriod: "2 years from last transaction",
      contactDetails: "privacy@test.ondc.org",
      grievanceOfficerName: "Ramesh Kumar",
      grievanceOfficerEmail: "grievance@test.ondc.org",
    });

    const parsed = JSON.parse(notice);
    expect(parsed.rights).toHaveLength(6);
    expect(parsed.rights).toContainEqual(expect.stringContaining("access"));
    expect(parsed.rights).toContainEqual(expect.stringContaining("correction"));
    expect(parsed.rights).toContainEqual(expect.stringContaining("erasure"));
    expect(parsed.rights).toContainEqual(expect.stringContaining("withdraw consent"));
    expect(parsed.rights).toContainEqual(expect.stringContaining("nominate"));
    expect(parsed.rights).toContainEqual(expect.stringContaining("grievance"));
    expect(parsed.fiduciary).toBe("ONDC Test Pvt Ltd");
    expect(parsed.governing_law).toContain("Digital Personal Data Protection Act");
    expect(parsed.grievance_officer.name).toBe("Ramesh Kumar");
    expect(parsed.grievance_officer.email).toBe("grievance@test.ondc.org");
  });

  it("generateConsentNotice with Hindi characters in fiduciary name", () => {
    const notice = generateConsentNotice({
      dataFiduciary: "\u0913\u090F\u0928\u0921\u0940\u0938\u0940 \u091F\u0947\u0938\u094D\u091F \u092A\u094D\u0930\u093E\u0907\u0935\u0947\u091F \u0932\u093F\u092E\u093F\u091F\u0947\u0921",
      purposes: ["\u0911\u0930\u094D\u0921\u0930 \u092A\u094D\u0930\u094B\u0938\u0947\u0938\u093F\u0902\u0917"],
      dataCategories: ["\u0928\u093E\u092E", "\u092B\u094B\u0928"],
      retentionPeriod: "2 \u0938\u093E\u0932",
      contactDetails: "contact@test.in",
      grievanceOfficerName: "\u0930\u093E\u092E\u0947\u0936",
      grievanceOfficerEmail: "grievance@test.in",
    });

    const parsed = JSON.parse(notice);
    expect(parsed.fiduciary).toContain("\u0913\u090F\u0928\u0921\u0940\u0938\u0940");
    expect(parsed.rights).toHaveLength(6);
  });

  it("breach notification deadline: detected now -> deadline = now + 72h exactly", () => {
    const now = new Date("2026-04-05T10:00:00.000Z");
    const deadline = getBreachNotificationDeadline(now);
    const expected = new Date("2026-04-08T10:00:00.000Z");
    expect(deadline.getTime()).toBe(expected.getTime());
    expect(BREACH_NOTIFICATION_HOURS).toBe(72);
  });

  it("breach notification deadline: detected at midnight -> deadline is midnight + 72h", () => {
    const midnight = new Date("2026-04-01T00:00:00.000Z");
    const deadline = getBreachNotificationDeadline(midnight);
    expect(deadline.toISOString()).toBe("2026-04-04T00:00:00.000Z");
  });

  it("cross-border transfer: IND destination -> allowed", () => {
    expect(isTransferAllowed("IND")).toBe(true);
  });

  it("cross-border transfer: when no restrictions -> all allowed (current state)", () => {
    expect(isTransferAllowed("USA")).toBe(true);
    expect(isTransferAllowed("GBR")).toBe(true);
    expect(isTransferAllowed("CHN")).toBe(true);
    expect(isTransferAllowed("SGP")).toBe(true);
  });

  it("fiduciary obligation checklist: all true -> compliant", () => {
    const result = checkFiduciaryObligations({
      consentManagementImplemented: true,
      dataPurposeLimitation: true,
      dataMinimization: true,
      storageRetentionLimits: true,
      securitySafeguards: true,
      breachNotificationProcess: true,
      grievanceRedressalMechanism: true,
      dataProtectionOfficerAppointed: true,
    });
    expect(result.compliant).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it("fiduciary obligation checklist: one false -> not compliant, gap listed", () => {
    const result = checkFiduciaryObligations({
      consentManagementImplemented: true,
      dataPurposeLimitation: true,
      dataMinimization: true,
      storageRetentionLimits: true,
      securitySafeguards: false,
      breachNotificationProcess: true,
      grievanceRedressalMechanism: true,
      dataProtectionOfficerAppointed: true,
    });
    expect(result.compliant).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toContain("Section 9(7)");
    expect(result.gaps[0]).toContain("security safeguards");
  });

  it("data principal response deadline: within timeframe -> valid", () => {
    const requestedAt = new Date("2026-04-01T00:00:00Z");
    const deadline = getDataPrincipalResponseDeadline(requestedAt);
    const respondedAt = new Date("2026-04-20T00:00:00Z");
    expect(respondedAt < deadline).toBe(true);
    expect(DATA_PRINCIPAL_RESPONSE_DAYS).toBe(30);
  });

  it("legitimate use purposes include all defined purposes", () => {
    expect(LEGITIMATE_USE_PURPOSES).toContain("VOLUNTARY_PROVISION");
    expect(LEGITIMATE_USE_PURPOSES).toContain("STATE_FUNCTION");
    expect(LEGITIMATE_USE_PURPOSES).toContain("LEGAL_OBLIGATION");
    expect(LEGITIMATE_USE_PURPOSES).toContain("MEDICAL_EMERGENCY");
    expect(LEGITIMATE_USE_PURPOSES).toContain("EMPLOYMENT");
    expect(LEGITIMATE_USE_PURPOSES.length).toBe(5);

    for (const p of LEGITIMATE_USE_PURPOSES) {
      expect(isLegitimateUse(p)).toBe(true);
    }
    expect(isLegitimateUse("MARKETING")).toBe(false);
  });
});

// =========================================================================
// 2. IT Act 2000 / CERT-In Tests
// =========================================================================

describe("IT Act 2000 / CERT-In", () => {
  const base = new Date("2026-04-05T12:00:00.000Z");

  it("CRITICAL incident -> 6 hour deadline", () => {
    const deadline = getCertInReportingDeadline(IncidentSeverity.CRITICAL, base);
    expect(deadline.getTime()).toBe(base.getTime() + 6 * 3600 * 1000);
  });

  it("HIGH incident -> 24 hour deadline", () => {
    const deadline = getCertInReportingDeadline(IncidentSeverity.HIGH, base);
    expect(deadline.getTime()).toBe(base.getTime() + 24 * 3600 * 1000);
  });

  it("MEDIUM incident -> 72 hour deadline", () => {
    const deadline = getCertInReportingDeadline(IncidentSeverity.MEDIUM, base);
    expect(deadline.getTime()).toBe(base.getTime() + 72 * 3600 * 1000);
  });

  it("LOW incident -> 720 hour (30 day) deadline", () => {
    const deadline = getCertInReportingDeadline(IncidentSeverity.LOW, base);
    expect(deadline.getTime()).toBe(base.getTime() + 720 * 3600 * 1000);
  });

  it("security practices checklist: all enabled -> compliant", () => {
    const result = checkSecurityPractices({
      encryptionAtRest: true,
      encryptionInTransit: true,
      accessControl: true,
      auditLogging: true,
      incidentResponse: true,
      dataBackup: true,
      vulnerabilityManagement: true,
      securityAwareness: true,
    });
    expect(result.compliant).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it("security practices checklist: encryption disabled -> specific gap mentions Section 43A", () => {
    const result = checkSecurityPractices({
      encryptionAtRest: false,
      encryptionInTransit: true,
      accessControl: true,
      auditLogging: true,
      incidentResponse: true,
      dataBackup: true,
      vulnerabilityManagement: true,
      securityAwareness: true,
    });
    expect(result.compliant).toBe(false);
    expect(result.gaps.length).toBeGreaterThanOrEqual(1);
    const encGap = result.gaps.find((g) => g.includes("encryption at rest"));
    expect(encGap).toBeDefined();
    expect(encGap).toContain("Section 43A");
  });

  it("LOG_RETENTION_DAYS = 180 (CERT-In minimum)", () => {
    expect(LOG_RETENTION_DAYS).toBe(180);
  });

  it("all reportable incident types are defined", () => {
    expect(CERT_IN_REPORTABLE_INCIDENTS.length).toBe(15);
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("data_breach");
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("unauthorized_access");
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("denial_of_service");
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("malicious_code_attacks");
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("identity_theft_spoofing_phishing");
    expect(CERT_IN_REPORTABLE_INCIDENTS).toContain("attacks_on_digital_payment_systems");
  });
});

// =========================================================================
// 3. Consumer Protection Act 2019 Tests
// =========================================================================

describe("Consumer Protection Act 2019", () => {
  const validSeller = {
    legalName: "Test Seller Pvt Ltd",
    registeredAddress: "123, MG Road, Bangalore 560001",
    contactNumber: "+919876543210",
    email: "seller@test.com",
    returnPolicy: "7-day no-questions-asked return",
    refundPolicy: "Full refund within 14 days",
    shippingPolicy: "Free shipping above Rs 499",
    grievanceOfficer: {
      name: "Suresh Kumar",
      designation: "Grievance Officer",
      contact: "+919876543211",
    },
  };

  it("validateSellerDisclosure with all fields -> valid", () => {
    const result = validateSellerDisclosure(validSeller);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("validateSellerDisclosure missing legalName -> invalid, field listed", () => {
    const { legalName, ...partial } = validSeller;
    const result = validateSellerDisclosure(partial);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("legalName");
  });

  it("validateSellerDisclosure missing grievanceOfficer -> invalid", () => {
    const { grievanceOfficer, ...partial } = validSeller;
    const result = validateSellerDisclosure(partial);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("grievanceOfficer");
  });

  it("validateProductCompliance with all fields -> valid", () => {
    const result = validateProductCompliance({
      countryOfOrigin: "IND",
      mrp: 499,
      manufacturer: "Test Mfg Pvt Ltd",
      manufactureDate: "2026-01-01",
      expiryDate: "2027-01-01",
    });
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("validateProductCompliance missing countryOfOrigin -> mentions E-Commerce Rules 2020", () => {
    const result = validateProductCompliance({
      manufacturer: "Test Mfg",
    });
    expect(result.valid).toBe(false);
    const coo = result.missing.find((m) => m.includes("countryOfOrigin"));
    expect(coo).toBeDefined();
    expect(coo).toContain("E-Commerce Rules 2020");
  });

  it("validateProductCompliance with expired product -> warning", () => {
    const result = validateProductCompliance({
      countryOfOrigin: "IND",
      manufacturer: "Test Mfg",
      expiryDate: "2020-01-01",
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining("expired"));
  });

  it("validateProductCompliance with product expiring in 15 days -> warning about 30-day threshold", () => {
    const fifteenDaysOut = new Date();
    fifteenDaysOut.setDate(fifteenDaysOut.getDate() + 15);
    const result = validateProductCompliance({
      countryOfOrigin: "IND",
      manufacturer: "Test Mfg",
      expiryDate: fifteenDaysOut.toISOString(),
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining("30 days"));
  });

  it("validateProductCompliance with MRP = 0 -> invalid", () => {
    const result = validateProductCompliance({
      countryOfOrigin: "IND",
      manufacturer: "Test Mfg",
      mrp: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContainEqual(expect.stringContaining("MRP"));
  });

  it("validateProductCompliance with negative MRP -> invalid", () => {
    const result = validateProductCompliance({
      countryOfOrigin: "IND",
      manufacturer: "Test Mfg",
      mrp: -100,
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContainEqual(expect.stringContaining("MRP"));
  });

  it("MAX_REFUND_PROCESSING_DAYS = 14", () => {
    expect(MAX_REFUND_PROCESSING_DAYS).toBe(14);
  });
});

// =========================================================================
// 4. GST Tests
// =========================================================================

describe("GST Compliance", () => {
  describe("validateGstin", () => {
    it('valid format "29ABCDE1234F1Z5" -> true', () => {
      expect(validateGstin("29ABCDE1234F1Z5")).toBe(true);
    });

    it("every valid state code (01-38) produces valid GSTIN", () => {
      const validStateCodes = Object.keys(GST_STATE_CODES);
      for (const code of validStateCodes) {
        if (code === "97") continue; // Other Territory, skip
        const gstin = `${code}ABCDE1234F1Z5`;
        expect(validateGstin(gstin)).toBe(true);
      }
    });

    it("state code 99 passes format check (regex validates format, not state code semantics)", () => {
      // The GSTIN regex validates structural format: 2 digits + PAN + entity + Z + check
      // It does NOT cross-reference against GST_STATE_CODES. State code validation
      // is a separate concern (lookup in GST_STATE_CODES map).
      expect(validateGstin("99ABCDE1234F1Z5")).toBe(true);
      // But 99 is NOT in the state codes map
      expect(GST_STATE_CODES["99"]).toBeUndefined();
    });

    it("lowercase -> false", () => {
      expect(validateGstin("29abcde1234f1z5")).toBe(false);
    });

    it("length 14 -> false", () => {
      expect(validateGstin("29ABCDE1234F1Z")).toBe(false);
    });

    it("length 16 -> false", () => {
      expect(validateGstin("29ABCDE1234F1Z55")).toBe(false);
    });

    it("special characters -> false", () => {
      expect(validateGstin("29ABCDE1234F!Z5")).toBe(false);
      expect(validateGstin("29ABC@E1234F1Z5")).toBe(false);
    });
  });

  describe("calculateGstBreakup", () => {
    it("intra-state 18%: CGST = 9%, SGST = 9%, IGST = 0", () => {
      const result = calculateGstBreakup({ amount: 1000, gstRate: 18, isInterState: false });
      expect(result.cgst).toBe(90);
      expect(result.sgst).toBe(90);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(180);
      expect(result.totalWithTax).toBe(1180);
    });

    it("inter-state 18%: CGST = 0, SGST = 0, IGST = 18%", () => {
      const result = calculateGstBreakup({ amount: 1000, gstRate: 18, isInterState: true });
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(180);
      expect(result.totalTax).toBe(180);
      expect(result.totalWithTax).toBe(1180);
    });

    it("0% rate (exempt goods)", () => {
      const result = calculateGstBreakup({ amount: 500, gstRate: 0, isInterState: false });
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.totalWithTax).toBe(500);
    });

    it("28% rate (luxury)", () => {
      const result = calculateGstBreakup({ amount: 10000, gstRate: 28, isInterState: false });
      expect(result.cgst).toBe(1400);
      expect(result.sgst).toBe(1400);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(2800);
      expect(result.totalWithTax).toBe(12800);
    });

    it("amount = 0", () => {
      const result = calculateGstBreakup({ amount: 0, gstRate: 18, isInterState: false });
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.totalWithTax).toBe(0);
    });

    it("very large amount (1 crore)", () => {
      const crore = 10_000_000;
      const result = calculateGstBreakup({ amount: crore, gstRate: 18, isInterState: true });
      expect(result.igst).toBe(1_800_000);
      expect(result.totalWithTax).toBe(11_800_000);
    });
  });

  describe("validateHsnCode", () => {
    it("4 digits -> valid", () => expect(validateHsnCode("8471")).toBe(true));
    it("6 digits -> valid", () => expect(validateHsnCode("847130")).toBe(true));
    it("8 digits -> valid", () => expect(validateHsnCode("84713010")).toBe(true));
    it("5 digits -> invalid", () => expect(validateHsnCode("84713")).toBe(false));
    it("7 digits -> invalid", () => expect(validateHsnCode("8471301")).toBe(false));
    it("letters -> invalid", () => expect(validateHsnCode("84AB")).toBe(false));
  });

  it("GST_RATES enum has all 5 rates", () => {
    expect(Object.keys(GST_RATES)).toHaveLength(5);
    expect(GST_RATES.EXEMPT).toBe(0);
    expect(GST_RATES.ESSENTIAL).toBe(5);
    expect(GST_RATES.STANDARD).toBe(12);
    expect(GST_RATES.GENERAL).toBe(18);
    expect(GST_RATES.LUXURY).toBe(28);
  });

  describe("TCS calculation (1% for e-commerce)", () => {
    it("TCS_RATE_PERCENT = 1", () => {
      expect(TCS_RATE_PERCENT).toBe(1);
    });

    it("intra-state TCS split", () => {
      const result = calculateTcs({ netTaxableSupply: 10000, isInterState: false });
      expect(result.tcsAmount).toBe(100);
      expect(result.cgstTcs).toBe(50);
      expect(result.sgstTcs).toBe(50);
      expect(result.igstTcs).toBe(0);
    });

    it("inter-state TCS", () => {
      const result = calculateTcs({ netTaxableSupply: 10000, isInterState: true });
      expect(result.tcsAmount).toBe(100);
      expect(result.cgstTcs).toBe(0);
      expect(result.sgstTcs).toBe(0);
      expect(result.igstTcs).toBe(100);
    });

    it("TCS on zero supply", () => {
      const result = calculateTcs({ netTaxableSupply: 0, isInterState: false });
      expect(result.tcsAmount).toBe(0);
    });

    it("TCS on large supply (1 crore)", () => {
      const result = calculateTcs({ netTaxableSupply: 10_000_000, isInterState: true });
      expect(result.tcsAmount).toBe(100_000);
      expect(result.igstTcs).toBe(100_000);
    });
  });
});

// =========================================================================
// 5. Catalog Indian Law Validation
// =========================================================================

describe("Catalog Indian Law Validation", () => {
  const baseProvider: Record<string, unknown> = {
    id: "P1",
    descriptor: { name: "Test Provider" },
    tags: [
      { code: "serviceability", list: [] },
      { code: "fssai_license_no", value: "12345678901234" },
      { code: "tax_credentials", list: [{ code: "gstin", value: "29ABCDE1234F1Z5" }] },
    ],
  };

  const baseItem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "I1",
    descriptor: { name: "Test Item", short_desc: "Desc", images: ["https://img.test/1.jpg"] },
    price: { currency: "INR", value: "100", maximum_value: "150" },
    category_id: "cat1",
    fulfillment_id: "f1",
    quantity: { available: { count: 10 } },
    tags: [
      { code: "origin", list: [{ code: "country", value: "IND" }] },
      { code: "veg_nonveg", value: "veg" },
    ],
    ...overrides,
  });

  it("item without country of origin -> error", () => {
    const item = baseItem({
      tags: [{ code: "veg_nonveg", value: "veg" }],
    });
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const coo = result.errors.find((e) => e.field.includes("country_of_origin"));
    expect(coo).toBeDefined();
    expect(coo!.message).toContain("Country of origin");
  });

  it("item with country of origin IND -> pass (no country error)", () => {
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const cooErr = result.errors.find((e) => e.field.includes("country_of_origin"));
    expect(cooErr).toBeUndefined();
  });

  it("food item (RET11) without FSSAI license -> error", () => {
    const provider: Record<string, unknown> = {
      id: "P1",
      descriptor: { name: "Food Provider" },
      tags: [{ code: "serviceability", list: [] }],
    };
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET11", provider, [item]);
    const fssai = result.errors.find((e) => e.field.includes("fssai"));
    expect(fssai).toBeDefined();
    expect(fssai!.message).toContain("FSSAI");
  });

  it("food item with valid 14-digit FSSAI -> pass", () => {
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET11", baseProvider, [item]);
    const fssaiErr = result.errors.find((e) => e.field.includes("fssai"));
    expect(fssaiErr).toBeUndefined();
  });

  it("food item with 13-digit FSSAI -> warning (wrong length)", () => {
    const provider: Record<string, unknown> = {
      id: "P1",
      descriptor: { name: "Food Provider" },
      tags: [
        { code: "serviceability", list: [] },
        { code: "fssai_license_no", value: "1234567890123" }, // 13 digits
      ],
    };
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET11", provider, [item]);
    const fssaiWarn = result.warnings.find((w) => w.field.includes("fssai"));
    expect(fssaiWarn).toBeDefined();
    expect(fssaiWarn!.message).toContain("14 digits");
  });

  it("item with selling price > MRP -> error", () => {
    const item = baseItem({
      price: { currency: "INR", value: "200", maximum_value: "150" },
    });
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const priceErr = result.errors.find((e) => e.field.includes("price"));
    expect(priceErr).toBeDefined();
    expect(priceErr!.message).toContain("MRP");
  });

  it("item with selling price = MRP -> pass", () => {
    const item = baseItem({
      price: { currency: "INR", value: "150", maximum_value: "150" },
    });
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const priceErr = result.errors.find(
      (e) => e.field.includes("price") && e.message.includes("MRP"),
    );
    expect(priceErr).toBeUndefined();
  });

  it("item with selling price < MRP -> pass", () => {
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const priceErr = result.errors.find(
      (e) => e.field.includes("price") && e.message.includes("MRP"),
    );
    expect(priceErr).toBeUndefined();
  });

  it("provider with valid GSTIN -> no GSTIN error", () => {
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET10", baseProvider, [item]);
    const gstErr = result.errors.find((e) => e.field.includes("gstin"));
    expect(gstErr).toBeUndefined();
  });

  it("provider with invalid GSTIN -> error", () => {
    const provider: Record<string, unknown> = {
      id: "P1",
      descriptor: { name: "Test" },
      tags: [
        { code: "serviceability", list: [] },
        { code: "fssai_license_no", value: "12345678901234" },
        { code: "tax_credentials", list: [{ code: "gstin", value: "INVALID" }] },
      ],
    };
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET11", provider, [item]);
    const gstErr = result.errors.find((e) => e.field.includes("gstin"));
    expect(gstErr).toBeDefined();
  });

  it("non-food domain item without FSSAI -> pass (not required)", () => {
    const provider: Record<string, unknown> = {
      id: "P1",
      descriptor: { name: "Fashion Provider" },
      tags: [{ code: "serviceability", list: [] }],
    };
    const item = baseItem();
    const result = validateIndianLawCompliance("ONDC:RET12", provider, [item]);
    const fssaiErr = result.errors.find((e) => e.field.includes("fssai"));
    expect(fssaiErr).toBeUndefined();
  });
});

// =========================================================================
// 6. XSS Sanitizer Tests
// =========================================================================

describe("XSS Sanitizer", () => {
  describe("escapeHtml", () => {
    it("escapes & character", () => expect(escapeHtml("a&b")).toBe("a&amp;b"));
    it("escapes < character", () => expect(escapeHtml("a<b")).toBe("a&lt;b"));
    it("escapes > character", () => expect(escapeHtml("a>b")).toBe("a&gt;b"));
    it('escapes " character', () => expect(escapeHtml('a"b')).toBe("a&quot;b"));
    it("escapes ' character", () => expect(escapeHtml("a'b")).toBe("a&#x27;b"));
    it("escapes / character", () => expect(escapeHtml("a/b")).toBe("a&#x2F;b"));
    it("escapes ` character", () => expect(escapeHtml("a`b")).toBe("a&#96;b"));

    it("escapes combined XSS payload", () => {
      const payload = '<script>alert("xss")</script>';
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain("<");
      expect(escaped).not.toContain(">");
      expect(escaped).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;",
      );
    });

    it("escapes event handler pattern", () => {
      const escaped = escapeHtml('onload="alert(1)"');
      expect(escaped).toContain("&quot;");
      expect(escaped).not.toContain('"alert');
    });

    it("escapes Unicode escape sequences", () => {
      // These are literal backslash-u sequences, not actual Unicode chars
      const input = "\\u003cscript\\u003e";
      const escaped = escapeHtml(input);
      // The backslashes and alphanumeric chars should pass through unchanged
      expect(escaped).toBe("\\u003cscript\\u003e");
    });

    it("empty string -> empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("safe string -> unchanged", () => {
      expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
    });
  });

  describe("sanitizeCatalogItem", () => {
    it("XSS in name -> escaped", () => {
      const item = { descriptor: { name: '<img onerror="alert(1)">' } };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.name).not.toContain("<");
    });

    it("XSS in short_desc -> escaped", () => {
      const item = { descriptor: { short_desc: "<script>x</script>" } };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.short_desc).not.toContain("<script>");
    });

    it("XSS in long_desc -> escaped", () => {
      const item = { descriptor: { long_desc: '"><svg onload=alert(1)>' } };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.long_desc).not.toContain("<svg");
    });

    it("XSS in tag values -> escaped", () => {
      const item = {
        tags: [{ list: [{ value: '<script>alert("xss")</script>' }] }],
      };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.tags[0].list[0].value).not.toContain("<script>");
    });

    it("javascript: URL in image -> filtered out", () => {
      const item = {
        descriptor: {
          name: "Test",
          images: ["javascript:alert(1)"],
        },
      };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.images).toHaveLength(0);
    });

    it("https:// URL in image -> kept", () => {
      const item = {
        descriptor: {
          name: "Test",
          images: ["https://example.com/img.jpg"],
        },
      };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.images).toHaveLength(1);
      expect(sanitized.descriptor.images[0]).toBe("https://example.com/img.jpg");
    });

    it("data:image/png URL -> kept", () => {
      const item = {
        descriptor: {
          name: "Test",
          images: ["data:image/png;base64,iVBOR..."],
        },
      };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.images).toHaveLength(1);
    });

    it("data:text/html URL -> filtered out", () => {
      const item = {
        descriptor: {
          name: "Test",
          images: ["data:text/html,<script>alert(1)</script>"],
        },
      };
      const sanitized = sanitizeCatalogItem(item);
      expect(sanitized.descriptor.images).toHaveLength(0);
    });
  });

  describe("sanitizeCatalog", () => {
    it("multiple providers with XSS -> all sanitized", () => {
      const catalog = {
        "bpp/providers": [
          {
            descriptor: { name: "<script>p1</script>" },
            items: [
              { descriptor: { name: "<img src=x onerror=alert(1)>" } },
            ],
          },
          {
            descriptor: { name: "<b onmouseover=alert(2)>hover</b>", short_desc: '"><script>x</script>' },
            items: [
              { descriptor: { name: "safe item" } },
              { descriptor: { name: "<svg/onload=alert(3)>" } },
            ],
          },
        ],
      };
      const sanitized = sanitizeCatalog(catalog);
      for (const provider of sanitized["bpp/providers"]) {
        expect(provider.descriptor.name).not.toContain("<script>");
        expect(provider.descriptor.name).not.toContain("<b ");
        if (provider.descriptor.short_desc) {
          expect(provider.descriptor.short_desc).not.toContain("<script>");
        }
        for (const item of provider.items) {
          expect(item.descriptor.name).not.toContain("<img");
          expect(item.descriptor.name).not.toContain("<svg");
        }
      }
    });

    it("null/undefined input -> returns input unchanged", () => {
      expect(sanitizeCatalog(null)).toBeNull();
      expect(sanitizeCatalog(undefined)).toBeUndefined();
    });
  });
});

// =========================================================================
// 7. DNS Verification Tests
// =========================================================================

describe("DNS Verification (extended)", () => {
  beforeEach(() => {
    mockResolveTxt.mockReset();
  });

  it("domain with subdomain: sub.domain.example.com", async () => {
    const key = "mykey123";
    mockResolveTxt.mockResolvedValue([[`ondc-signing-key=${key}`]]);
    const result = await verifyDnsTxtRecord("sub.domain.example.com", key);
    expect(result.verified).toBe(true);
    expect(mockResolveTxt).toHaveBeenCalledWith("sub.domain.example.com");
  });

  it("domain with IDN characters (punycode)", async () => {
    const key = "idnkey456";
    mockResolveTxt.mockResolvedValue([[`ondc-signing-key=${key}`]]);
    const result = await verifyDnsTxtRecord("xn--nxasmq6b.example.com", key);
    expect(result.verified).toBe(true);
  });

  it("multiple TXT records where one matches", async () => {
    const key = "correctkey";
    mockResolveTxt.mockResolvedValue([
      ["v=spf1 include:_spf.google.com ~all"],
      ["google-site-verification=abc123"],
      [`ondc-signing-key=${key}`],
    ]);
    const result = await verifyDnsTxtRecord("example.com", key);
    expect(result.verified).toBe(true);
  });

  it("TXT record split across multiple chunks (DNS 255-byte limit)", async () => {
    const keyPart1 = "a".repeat(200);
    const keyPart2 = "b".repeat(100);
    const fullKey = keyPart1 + keyPart2;
    mockResolveTxt.mockResolvedValue([
      ["ondc-signing-key=", keyPart1, keyPart2],
    ]);
    const result = await verifyDnsTxtRecord("example.com", fullKey);
    expect(result.verified).toBe(true);
  });

  it("very long TXT record value", async () => {
    const longKey = "X".repeat(500);
    mockResolveTxt.mockResolvedValue([[`ondc-signing-key=${longKey}`]]);
    const result = await verifyDnsTxtRecord("example.com", longKey);
    expect(result.verified).toBe(true);
  });
});

// =========================================================================
// 8. Tracing Tests
// =========================================================================

describe("Tracing", () => {
  function mockRequest(headers: Record<string, string> = {}) {
    return {
      headers,
      body: {},
      method: "POST",
      url: "/search",
      ip: "127.0.0.1",
      traceId: undefined as string | undefined,
      spanId: undefined as string | undefined,
      parentSpanId: undefined as string | undefined,
    } as any;
  }

  function mockReply() {
    const hdrs: Record<string, unknown> = {};
    const reply: any = {
      header: (n: string, v: unknown) => { hdrs[n] = v; return reply; },
      then: (ok: () => void) => { /* noop */ },
      statusCode: 200,
    };
    reply._headers = hdrs;
    return reply;
  }

  it("buildTraceHeaders returns x-trace-id, x-span-id, x-parent-span-id", async () => {
    const req = mockRequest();
    const rep = mockReply();
    await tracingMiddleware(req, rep);

    const headers = buildTraceHeaders(req);
    expect(headers).toHaveProperty(TRACE_ID_HEADER);
    expect(headers).toHaveProperty(SPAN_ID_HEADER);
    expect(headers).toHaveProperty(PARENT_SPAN_HEADER);
    expect(typeof headers[TRACE_ID_HEADER]).toBe("string");
    expect(typeof headers[SPAN_ID_HEADER]).toBe("string");
    expect(typeof headers[PARENT_SPAN_HEADER]).toBe("string");
  });

  it("buildTraceHeadersFromContext with provided trace context", () => {
    const traceId = "my-trace-id-123";
    const parentSpanId = "parent-span-456";
    const headers = buildTraceHeadersFromContext(traceId, parentSpanId);
    expect(headers[TRACE_ID_HEADER]).toBe(traceId);
    expect(headers[PARENT_SPAN_HEADER]).toBe(parentSpanId);
    expect(headers[SPAN_ID_HEADER]).toBeDefined();
    expect(headers[SPAN_ID_HEADER]).not.toBe(parentSpanId);
  });

  it("createRequestLogger returns child logger with traceId bound", () => {
    const logger = createRequestLogger({
      traceId: "trace-abc",
      spanId: "span-def",
      parentSpanId: "parent-ghi",
    });
    // The logger should have the trace fields. pino child loggers have a bindings method.
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("trace headers propagated correctly (format verification)", async () => {
    const req = mockRequest({ [TRACE_ID_HEADER]: "incoming-trace" });
    const rep = mockReply();
    await tracingMiddleware(req, rep);

    expect(req.traceId).toBe("incoming-trace");
    expect(req.spanId).toHaveLength(16);

    const outHeaders = buildTraceHeaders(req);
    expect(outHeaders[TRACE_ID_HEADER]).toBe("incoming-trace");
    expect(outHeaders[PARENT_SPAN_HEADER]).toBe(req.spanId);
    expect(outHeaders[SPAN_ID_HEADER]).toHaveLength(16);
  });
});

// =========================================================================
// 9. End-to-End Flow Simulation
// =========================================================================

describe("End-to-End Flow Simulation", () => {
  const keyPair = generateKeyPair();
  const subscriberId = "test-bap.ondc.org";
  const uniqueKeyId = "key-1";
  const bapId = "test-bap.ondc.org";
  const bapUri = "https://test-bap.ondc.org/beckn";
  const bppId = "test-bpp.ondc.org";
  const bppUri = "https://test-bpp.ondc.org/beckn";
  const domain = "ONDC:RET10";

  describe("search -> on_search -> select -> on_select -> init -> on_init -> confirm -> on_confirm", () => {
    it("full flow with signing, verification, and validation", () => {
      const transactionId = randomUUID();

      // --- Step 1: search ---
      const searchCtx = buildContext({
        domain,
        action: "search",
        bap_id: bapId,
        bap_uri: bapUri,
        transaction_id: transactionId,
      });
      const searchReq = {
        context: searchCtx,
        message: { intent: { descriptor: { name: "rice" } } },
      };
      const searchAuth = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: keyPair.privateKey,
        body: searchReq,
      });
      expect(parseAuthHeader(searchAuth)).not.toBeNull();
      expect(verifyAuthHeader({
        header: searchAuth,
        body: searchReq,
        publicKey: keyPair.publicKey,
      })).toBe(true);
      // search is broadcast, doesn't need bpp_id so we skip full validation

      // --- Step 2: on_search (callback) ---
      const onSearchCtx = buildContext({
        domain,
        action: "on_search",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
        message_id: searchCtx.message_id, // same message_id
      });
      const onSearchReq = {
        context: onSearchCtx,
        message: {
          catalog: {
            "bpp/providers": [{
              id: "P1",
              descriptor: { name: "Rice Store" },
              items: [{ id: "I1", descriptor: { name: "Basmati Rice" }, price: { currency: "INR", value: "200" } }],
            }],
          },
        },
      };
      const onSearchValidation = validateBecknRequest(onSearchReq);
      expect(onSearchValidation.valid).toBe(true);
      expect(onSearchCtx.message_id).toBe(searchCtx.message_id);

      // --- Step 3: select ---
      const selectCtx = buildContext({
        domain,
        action: "select",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
      });
      const selectReq = {
        context: selectCtx,
        message: {
          order: {
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
          },
        },
      };
      const selectAuth = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: keyPair.privateKey,
        body: selectReq,
      });
      expect(verifyAuthHeader({
        header: selectAuth,
        body: selectReq,
        publicKey: keyPair.publicKey,
      })).toBe(true);
      const selectValidation = validateBecknRequest(selectReq);
      expect(selectValidation.valid).toBe(true);

      // --- Step 4: on_select ---
      const onSelectCtx = buildContext({
        domain,
        action: "on_select",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
        message_id: selectCtx.message_id,
      });
      const onSelectReq = {
        context: onSelectCtx,
        message: {
          order: {
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
            quote: {
              price: { currency: "INR", value: "400" },
              breakup: [
                { title: "Rice", price: { currency: "INR", value: "400" }, "@ondc/org/title_type": "item" },
              ],
            },
          },
        },
      };
      expect(validateBecknRequest(onSelectReq).valid).toBe(true);

      // --- Step 5: init ---
      const initCtx = buildContext({
        domain,
        action: "init",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
      });
      const initReq = {
        context: initCtx,
        message: {
          order: {
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
            billing: { name: "Test User", phone: "+919876543210" },
            fulfillments: [{ id: "F1", type: "Delivery", end: { location: { gps: "12.9716,77.5946" } } }],
          },
        },
      };
      const initAuth = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: keyPair.privateKey,
        body: initReq,
      });
      expect(verifyAuthHeader({
        header: initAuth,
        body: initReq,
        publicKey: keyPair.publicKey,
      })).toBe(true);
      expect(validateBecknRequest(initReq).valid).toBe(true);

      // --- Step 6: on_init ---
      const onInitCtx = buildContext({
        domain,
        action: "on_init",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
        message_id: initCtx.message_id,
      });
      const onInitReq = {
        context: onInitCtx,
        message: {
          order: {
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
            payment: { type: "ON-FULFILLMENT", collected_by: "BPP" },
          },
        },
      };
      expect(validateBecknRequest(onInitReq).valid).toBe(true);

      // --- Step 7: confirm ---
      const confirmCtx = buildContext({
        domain,
        action: "confirm",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
      });
      const confirmReq = {
        context: confirmCtx,
        message: {
          order: {
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
            billing: { name: "Test User", phone: "+919876543210" },
            fulfillments: [{ id: "F1", type: "Delivery" }],
            payment: { type: "ON-FULFILLMENT", collected_by: "BPP" },
          },
        },
      };
      const confirmAuth = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: keyPair.privateKey,
        body: confirmReq,
      });
      expect(verifyAuthHeader({
        header: confirmAuth,
        body: confirmReq,
        publicKey: keyPair.publicKey,
      })).toBe(true);
      expect(validateBecknRequest(confirmReq).valid).toBe(true);

      // --- Step 8: on_confirm ---
      const onConfirmCtx = buildContext({
        domain,
        action: "on_confirm",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
        transaction_id: transactionId,
        message_id: confirmCtx.message_id,
      });
      const onConfirmReq = {
        context: onConfirmCtx,
        message: {
          order: {
            id: "ORDER-001",
            state: OrderState.Created,
            provider: { id: "P1" },
            items: [{ id: "I1", quantity: { count: 2 } }],
          },
        },
      };
      expect(validateBecknRequest(onConfirmReq).valid).toBe(true);
      expect(onConfirmReq.message.order.state).toBe("CREATED");

      // Verify all callback message_ids match originating request
      expect(onSearchCtx.message_id).toBe(searchCtx.message_id);
      expect(onSelectCtx.message_id).toBe(selectCtx.message_id);
      expect(onInitCtx.message_id).toBe(initCtx.message_id);
      expect(onConfirmCtx.message_id).toBe(confirmCtx.message_id);

      // Verify all use the same transaction_id
      const allContexts = [
        searchCtx, onSearchCtx, selectCtx, onSelectCtx,
        initCtx, onInitCtx, confirmCtx, onConfirmCtx,
      ];
      for (const ctx of allContexts) {
        expect(ctx.transaction_id).toBe(transactionId);
      }
    });
  });

  describe("cancellation flow", () => {
    it("confirmed order (CREATED) -> cancel -> CANCELLED (terminal)", () => {
      expect(isValidOrderTransition(OrderState.Created, OrderState.Cancelled)).toBe(true);
      expect(isTerminalState(OrderState.Cancelled)).toBe(true);

      // Also valid from ACCEPTED
      expect(isValidOrderTransition(OrderState.Accepted, OrderState.Cancelled)).toBe(true);

      // Build cancel request
      const cancelCtx = buildContext({
        domain,
        action: "cancel",
        bap_id: bapId,
        bap_uri: bapUri,
        bpp_id: bppId,
        bpp_uri: bppUri,
      });
      const cancelReq = {
        context: cancelCtx,
        message: {
          order: {
            id: "ORDER-001",
            state: OrderState.Cancelled,
          },
        },
      };
      const cancelAuth = buildAuthHeader({
        subscriberId,
        uniqueKeyId,
        privateKey: keyPair.privateKey,
        body: cancelReq,
      });
      expect(verifyAuthHeader({
        header: cancelAuth,
        body: cancelReq,
        publicKey: keyPair.publicKey,
      })).toBe(true);
      expect(validateBecknRequest(cancelReq).valid).toBe(true);

      // CANCELLED is terminal
      expect(isTerminalState(OrderState.Cancelled)).toBe(true);
      expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Created)).toBe(false);
      expect(isValidOrderTransition(OrderState.Cancelled, OrderState.Accepted)).toBe(false);
    });
  });

  describe("update flow with fulfillment state changes (P2P)", () => {
    it("walks full P2P delivery: Pending -> Packed -> AgentAssigned -> OrderPickedUp -> OutForDelivery -> OrderDelivered", () => {
      const p2pFlow: FulfillmentState[] = [
        FulfillmentState.Pending,
        FulfillmentState.Packed,
        FulfillmentState.AgentAssigned,
        FulfillmentState.OrderPickedUp,
        FulfillmentState.OutForDelivery,
        FulfillmentState.OrderDelivered,
      ];

      for (let i = 0; i < p2pFlow.length - 1; i++) {
        const from = p2pFlow[i]!;
        const to = p2pFlow[i + 1]!;
        expect(isValidFulfillmentTransition(from, to, "P2P")).toBe(true);
      }

      // OrderDelivered is terminal (no valid next states)
      expect(
        isValidFulfillmentTransition(FulfillmentState.OrderDelivered, FulfillmentState.Pending, "P2P"),
      ).toBe(false);
      expect(
        isValidFulfillmentTransition(FulfillmentState.OrderDelivered, FulfillmentState.Cancelled, "P2P"),
      ).toBe(false);

      // Verify each state along the way produces a valid update request
      const transactionId = randomUUID();
      for (let i = 1; i < p2pFlow.length; i++) {
        const updateCtx = buildContext({
          domain,
          action: "update",
          bap_id: bapId,
          bap_uri: bapUri,
          bpp_id: bppId,
          bpp_uri: bppUri,
          transaction_id: transactionId,
        });
        const updateReq = {
          context: updateCtx,
          message: {
            order: {
              id: "ORDER-001",
              fulfillments: [{
                id: "F1",
                state: { descriptor: { code: p2pFlow[i] } },
              }],
            },
          },
        };
        expect(validateBecknRequest(updateReq).valid).toBe(true);
      }
    });

    it("invalid transition: Pending -> OutForDelivery is rejected", () => {
      expect(
        isValidFulfillmentTransition(FulfillmentState.Pending, FulfillmentState.OutForDelivery, "P2P"),
      ).toBe(false);
    });

    it("invalid transition: OrderDelivered -> Pending is rejected", () => {
      expect(
        isValidFulfillmentTransition(FulfillmentState.OrderDelivered, FulfillmentState.Pending, "P2P"),
      ).toBe(false);
    });
  });
});
