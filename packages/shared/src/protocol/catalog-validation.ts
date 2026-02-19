/**
 * ONDC Domain-Specific Catalog Validation
 *
 * Comprehensive validation rules for catalog items across all ONDC retail,
 * logistics, and services domains. These rules enforce the ONDC specification
 * for mandatory item attributes, fulfillment types, payment schemas, and
 * domain-specific requirements.
 *
 * Reference: ONDC Buyer/Seller NP specifications
 * https://docs.google.com/document/d/1brvcltG_DagZ3kGr1ZZQk4hG4tze3zvcxmGV4NMTzr8
 */

// ---------------------------------------------------------------------------
// Validation Result Types
// ---------------------------------------------------------------------------

export interface CatalogValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface CatalogValidationResult {
  valid: boolean;
  errors: CatalogValidationError[];
  warnings: CatalogValidationError[];
}

// ---------------------------------------------------------------------------
// ONDC Fulfillment Types by Domain
// ---------------------------------------------------------------------------

export const FULFILLMENT_TYPES_BY_DOMAIN: Record<string, string[]> = {
  "ONDC:RET10": ["Delivery", "Self-Pickup"],
  "ONDC:RET11": ["Delivery", "Self-Pickup", "Dine-in"],
  "ONDC:RET12": ["Delivery", "Self-Pickup"],
  "ONDC:RET13": ["Delivery", "Self-Pickup"],
  "ONDC:RET14": ["Delivery", "Self-Pickup"],
  "ONDC:RET15": ["Delivery", "Self-Pickup"],
  "ONDC:RET16": ["Delivery", "Self-Pickup"],
  "ONDC:RET17": ["Delivery", "Self-Pickup"],
  "ONDC:RET18": ["Delivery", "Self-Pickup"],
  "ONDC:RET19": ["Delivery", "Self-Pickup"],
  "ONDC:RET20": ["Delivery", "Self-Pickup"],
  "ONDC:LOG10": ["Delivery", "RTO"],
  "ONDC:LOG11": ["Delivery", "RTO"],
  "ONDC:SRV11": ["Online", "Offline"],
  "ONDC:SRV13": ["Online", "Offline"],
  "ONDC:SRV18": ["Offline"],
  "ONDC:TRV10": ["RIDE", "RENTAL"],
  "ONDC:TRV11": ["ROUTE", "TRIP"],
};

// ---------------------------------------------------------------------------
// ONDC Payment Types
// ---------------------------------------------------------------------------

export const ONDC_PAYMENT_TYPES = [
  "PRE-FULFILLMENT",
  "ON-FULFILLMENT",
  "POST-FULFILLMENT",
] as const;

export const ONDC_PAYMENT_COLLECTED_BY = ["BAP", "BPP"] as const;

// ---------------------------------------------------------------------------
// ONDC Item Required Fields per Domain
// ---------------------------------------------------------------------------

export interface DomainItemRule {
  /** Fields required on the item descriptor */
  requiredDescriptorFields: string[];
  /** Required item-level fields */
  requiredItemFields: string[];
  /** Required tag codes on items */
  requiredItemTags: string[];
  /** Required provider-level tag codes */
  requiredProviderTags: string[];
  /** Required fields in item.price */
  requiredPriceFields: string[];
  /** Required fields in fulfillment */
  requiredFulfillmentFields: string[];
  /** Whether images are mandatory */
  imagesMandatory: boolean;
  /** Minimum number of images */
  minImages: number;
  /** Maximum item name length */
  maxNameLength: number;
  /** Whether UOM (unit of measure) is required */
  uomRequired: boolean;
  /** Allowed quantity UOMs */
  allowedUoms?: string[];
}

export const DOMAIN_ITEM_RULES: Record<string, DomainItemRule> = {
  "ONDC:RET10": { // Grocery
    requiredDescriptorFields: ["name", "short_desc", "long_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["veg_nonveg", "packaged_commodities", "time_to_ship"],
    requiredProviderTags: ["serviceability", "catalog_link", "timing"],
    requiredPriceFields: ["currency", "value", "maximum_value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 1,
    maxNameLength: 200,
    uomRequired: true,
    allowedUoms: ["unit", "dozen", "gram", "kilogram", "tonne", "litre", "millilitre", "pack"],
  },
  "ONDC:RET11": { // Food & Beverage
    requiredDescriptorFields: ["name", "short_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["veg_nonveg"],
    requiredProviderTags: ["serviceability", "timing"],
    requiredPriceFields: ["currency", "value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 1,
    maxNameLength: 200,
    uomRequired: false,
  },
  "ONDC:RET12": { // Fashion
    requiredDescriptorFields: ["name", "short_desc", "long_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["size_chart", "colour", "gender", "brand"],
    requiredProviderTags: ["serviceability"],
    requiredPriceFields: ["currency", "value", "maximum_value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 2,
    maxNameLength: 250,
    uomRequired: false,
  },
  "ONDC:RET13": { // Beauty & Personal Care
    requiredDescriptorFields: ["name", "short_desc", "long_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["brand"],
    requiredProviderTags: ["serviceability"],
    requiredPriceFields: ["currency", "value", "maximum_value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 1,
    maxNameLength: 250,
    uomRequired: true,
    allowedUoms: ["unit", "gram", "kilogram", "millilitre", "litre", "pack"],
  },
  "ONDC:RET14": { // Electronics
    requiredDescriptorFields: ["name", "short_desc", "long_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["brand", "model", "warranty"],
    requiredProviderTags: ["serviceability"],
    requiredPriceFields: ["currency", "value", "maximum_value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 2,
    maxNameLength: 300,
    uomRequired: false,
  },
  "ONDC:RET17": { // Pharma
    requiredDescriptorFields: ["name", "short_desc", "long_desc", "images"],
    requiredItemFields: ["id", "descriptor", "price", "category_id", "fulfillment_id", "quantity"],
    requiredItemTags: ["prescription_required"],
    requiredProviderTags: ["serviceability"],
    requiredPriceFields: ["currency", "value", "maximum_value"],
    requiredFulfillmentFields: ["id", "type"],
    imagesMandatory: true,
    minImages: 1,
    maxNameLength: 250,
    uomRequired: true,
    allowedUoms: ["unit", "pack", "strip", "bottle", "tube", "sachet"],
  },
};

// Default rules for domains without specific rules
const DEFAULT_ITEM_RULES: DomainItemRule = {
  requiredDescriptorFields: ["name", "short_desc", "images"],
  requiredItemFields: ["id", "descriptor", "price", "fulfillment_id"],
  requiredItemTags: [],
  requiredProviderTags: ["serviceability"],
  requiredPriceFields: ["currency", "value"],
  requiredFulfillmentFields: ["id", "type"],
  imagesMandatory: true,
  minImages: 1,
  maxNameLength: 250,
  uomRequired: false,
};

// ---------------------------------------------------------------------------
// ONDC Quote Breakup Types (mandatory in select/confirm)
// ---------------------------------------------------------------------------

export const ONDC_QUOTE_BREAKUP_TYPES = [
  "item",
  "delivery",
  "packing",
  "tax",
  "discount",
  "misc",
] as const;

export const REQUIRED_QUOTE_BREAKUP_TITLES: Record<string, string[]> = {
  "ONDC:RET10": ["item", "delivery", "packing", "tax"],
  "ONDC:RET11": ["item", "delivery", "packing", "tax"],
  "ONDC:RET12": ["item", "delivery", "tax"],
  "ONDC:RET13": ["item", "delivery", "tax"],
  "ONDC:RET14": ["item", "delivery", "tax"],
  "ONDC:RET17": ["item", "delivery", "tax"],
};

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validate a catalog provider's items against ONDC domain-specific rules.
 *
 * @param domain - ONDC domain code (e.g., "ONDC:RET10")
 * @param provider - Provider object from the catalog
 * @param items - Array of item objects from the catalog
 * @returns Validation result with errors and warnings
 */
export function validateCatalogItems(
  domain: string,
  provider: Record<string, unknown>,
  items: Record<string, unknown>[],
): CatalogValidationResult {
  const rules = DOMAIN_ITEM_RULES[domain] ?? DEFAULT_ITEM_RULES;
  const errors: CatalogValidationError[] = [];
  const warnings: CatalogValidationError[] = [];

  // Validate provider-level tags
  const providerTags = extractTags(provider);
  for (const requiredTag of rules.requiredProviderTags) {
    if (!providerTags.has(requiredTag)) {
      errors.push({
        field: `provider.tags`,
        message: `Missing required provider tag: "${requiredTag}" for domain ${domain}`,
        severity: "error",
      });
    }
  }

  // Validate provider descriptor
  const providerDesc = provider["descriptor"] as Record<string, unknown> | undefined;
  if (!providerDesc) {
    errors.push({
      field: "provider.descriptor",
      message: "Provider descriptor is required",
      severity: "error",
    });
  } else {
    if (!providerDesc["name"]) {
      errors.push({
        field: "provider.descriptor.name",
        message: "Provider name is required",
        severity: "error",
      });
    }
  }

  // Validate each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `items[${i}]`;

    // Required item fields
    for (const field of rules.requiredItemFields) {
      if (item[field] === undefined || item[field] === null) {
        errors.push({
          field: `${prefix}.${field}`,
          message: `Missing required item field: "${field}"`,
          severity: "error",
        });
      }
    }

    // Descriptor validation
    const descriptor = item["descriptor"] as Record<string, unknown> | undefined;
    if (descriptor) {
      for (const field of rules.requiredDescriptorFields) {
        if (field === "images") {
          const images = descriptor["images"] as unknown[] | undefined;
          if (rules.imagesMandatory && (!images || images.length < rules.minImages)) {
            errors.push({
              field: `${prefix}.descriptor.images`,
              message: `At least ${rules.minImages} image(s) required for ${domain}`,
              severity: "error",
            });
          }
        } else if (!descriptor[field]) {
          errors.push({
            field: `${prefix}.descriptor.${field}`,
            message: `Missing required descriptor field: "${field}"`,
            severity: "error",
          });
        }
      }

      // Name length check
      const name = descriptor["name"] as string | undefined;
      if (name && name.length > rules.maxNameLength) {
        warnings.push({
          field: `${prefix}.descriptor.name`,
          message: `Item name exceeds maximum length of ${rules.maxNameLength} characters`,
          severity: "warning",
        });
      }
    }

    // Price validation
    const price = item["price"] as Record<string, unknown> | undefined;
    if (price) {
      for (const field of rules.requiredPriceFields) {
        if (!price[field]) {
          errors.push({
            field: `${prefix}.price.${field}`,
            message: `Missing required price field: "${field}"`,
            severity: "error",
          });
        }
      }

      // Validate price values are numeric
      const value = price["value"] as string | undefined;
      if (value && isNaN(parseFloat(value))) {
        errors.push({
          field: `${prefix}.price.value`,
          message: "Price value must be a valid number",
          severity: "error",
        });
      }

      const maxValue = price["maximum_value"] as string | undefined;
      if (maxValue && isNaN(parseFloat(maxValue))) {
        errors.push({
          field: `${prefix}.price.maximum_value`,
          message: "Price maximum_value must be a valid number",
          severity: "error",
        });
      }

      // MRP should be >= selling price
      if (value && maxValue) {
        const sellingPrice = parseFloat(value);
        const mrp = parseFloat(maxValue);
        if (!isNaN(sellingPrice) && !isNaN(mrp) && sellingPrice > mrp) {
          errors.push({
            field: `${prefix}.price`,
            message: "Selling price (value) cannot exceed MRP (maximum_value)",
            severity: "error",
          });
        }
      }

      // Currency must be INR for domestic
      if (price["currency"] && price["currency"] !== "INR") {
        warnings.push({
          field: `${prefix}.price.currency`,
          message: "ONDC domestic transactions typically use INR",
          severity: "warning",
        });
      }
    }

    // Quantity / UOM validation
    if (rules.uomRequired) {
      const quantity = item["quantity"] as Record<string, unknown> | undefined;
      if (quantity) {
        const unitized = quantity["unitized"] as Record<string, unknown> | undefined;
        const measure = unitized?.["measure"] as Record<string, unknown> | undefined;
        const unit = measure?.["unit"] as string | undefined;

        if (!unit) {
          warnings.push({
            field: `${prefix}.quantity.unitized.measure.unit`,
            message: `UOM (unit of measure) recommended for ${domain}`,
            severity: "warning",
          });
        } else if (rules.allowedUoms && !rules.allowedUoms.includes(unit.toLowerCase())) {
          warnings.push({
            field: `${prefix}.quantity.unitized.measure.unit`,
            message: `UOM "${unit}" not in expected list: ${rules.allowedUoms.join(", ")}`,
            severity: "warning",
          });
        }
      }
    }

    // Item-level tags
    const itemTags = extractTags(item);
    for (const requiredTag of rules.requiredItemTags) {
      if (!itemTags.has(requiredTag)) {
        errors.push({
          field: `${prefix}.tags`,
          message: `Missing required item tag: "${requiredTag}" for domain ${domain}`,
          severity: "error",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an ONDC quote object against domain rules.
 */
export function validateQuote(
  domain: string,
  quote: Record<string, unknown>,
): CatalogValidationResult {
  const errors: CatalogValidationError[] = [];
  const warnings: CatalogValidationError[] = [];

  if (!quote["price"]) {
    errors.push({
      field: "quote.price",
      message: "Quote must include price",
      severity: "error",
    });
  } else {
    const price = quote["price"] as Record<string, unknown>;
    if (!price["currency"]) {
      errors.push({
        field: "quote.price.currency",
        message: "Quote price must include currency",
        severity: "error",
      });
    }
    if (!price["value"]) {
      errors.push({
        field: "quote.price.value",
        message: "Quote price must include value",
        severity: "error",
      });
    }
  }

  const breakup = quote["breakup"] as Record<string, unknown>[] | undefined;
  if (!breakup || !Array.isArray(breakup)) {
    errors.push({
      field: "quote.breakup",
      message: "Quote must include breakup array",
      severity: "error",
    });
  } else {
    // Verify required breakup types
    const requiredTypes = REQUIRED_QUOTE_BREAKUP_TITLES[domain];
    if (requiredTypes) {
      const presentTypes = new Set(
        breakup.map((b) => {
          const ondcType =
            (b["@ondc/org/title_type"] as string) ??
            (b["title_type"] as string) ??
            "";
          return ondcType.toLowerCase();
        }),
      );

      for (const reqType of requiredTypes) {
        if (!presentTypes.has(reqType)) {
          warnings.push({
            field: "quote.breakup",
            message: `Quote breakup missing expected type: "${reqType}" for domain ${domain}`,
            severity: "warning",
          });
        }
      }
    }

    // Validate each breakup entry
    for (let i = 0; i < breakup.length; i++) {
      const entry = breakup[i];
      if (!entry["price"]) {
        errors.push({
          field: `quote.breakup[${i}].price`,
          message: "Each breakup entry must include price",
          severity: "error",
        });
      }
    }

    // Verify total matches sum of breakup (with tolerance)
    const quotePrice = quote["price"] as Record<string, unknown> | undefined;
    if (quotePrice?.["value"]) {
      const total = parseFloat(quotePrice["value"] as string);
      const breakupSum = breakup.reduce((sum, b) => {
        const bp = b["price"] as Record<string, unknown> | undefined;
        return sum + (bp ? parseFloat((bp["value"] as string) ?? "0") : 0);
      }, 0);

      if (!isNaN(total) && !isNaN(breakupSum) && Math.abs(total - breakupSum) > 0.01) {
        errors.push({
          field: "quote.price.value",
          message: `Quote total (${total}) doesn't match breakup sum (${breakupSum.toFixed(2)})`,
          severity: "error",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate payment schema per ONDC requirements.
 */
export function validatePayment(
  payment: Record<string, unknown>,
): CatalogValidationResult {
  const errors: CatalogValidationError[] = [];
  const warnings: CatalogValidationError[] = [];

  // Payment type
  const type = payment["type"] as string | undefined;
  if (!type) {
    errors.push({
      field: "payment.type",
      message: "Payment type is required",
      severity: "error",
    });
  } else if (
    !ONDC_PAYMENT_TYPES.includes(type as (typeof ONDC_PAYMENT_TYPES)[number])
  ) {
    errors.push({
      field: "payment.type",
      message: `Invalid payment type: "${type}". Must be one of: ${ONDC_PAYMENT_TYPES.join(", ")}`,
      severity: "error",
    });
  }

  // Collected by
  const collectedBy = payment["collected_by"] as string | undefined;
  if (collectedBy) {
    if (
      !ONDC_PAYMENT_COLLECTED_BY.includes(
        collectedBy as (typeof ONDC_PAYMENT_COLLECTED_BY)[number],
      )
    ) {
      errors.push({
        field: "payment.collected_by",
        message: `Invalid collected_by: "${collectedBy}". Must be "BAP" or "BPP"`,
        severity: "error",
      });
    }
  }

  // Settlement details (ONDC-specific extension)
  const settlementDetails = payment[
    "@ondc/org/settlement_details"
  ] as Record<string, unknown>[] | undefined;
  if (settlementDetails && Array.isArray(settlementDetails)) {
    for (let i = 0; i < settlementDetails.length; i++) {
      const sd = settlementDetails[i];
      if (!sd["settlement_counterparty"]) {
        warnings.push({
          field: `payment.@ondc/org/settlement_details[${i}].settlement_counterparty`,
          message: "Settlement counterparty recommended",
          severity: "warning",
        });
      }
      if (!sd["settlement_type"]) {
        errors.push({
          field: `payment.@ondc/org/settlement_details[${i}].settlement_type`,
          message: "Settlement type is required",
          severity: "error",
        });
      }
    }
  }

  // Buyer finder fee (ONDC-specific extension)
  const buyerFinderFeeType = payment[
    "@ondc/org/buyer_app_finder_fee_type"
  ] as string | undefined;
  const buyerFinderFeeAmount = payment[
    "@ondc/org/buyer_app_finder_fee_amount"
  ] as string | undefined;

  if (buyerFinderFeeType && !["percent", "amount"].includes(buyerFinderFeeType)) {
    errors.push({
      field: "payment.@ondc/org/buyer_app_finder_fee_type",
      message: `Invalid finder fee type: "${buyerFinderFeeType}". Must be "percent" or "amount"`,
      severity: "error",
    });
  }

  if (buyerFinderFeeAmount && isNaN(parseFloat(buyerFinderFeeAmount))) {
    errors.push({
      field: "payment.@ondc/org/buyer_app_finder_fee_amount",
      message: "Buyer finder fee amount must be a valid number",
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate fulfillment type against domain-specific allowed types.
 */
export function validateFulfillmentType(
  domain: string,
  fulfillmentType: string,
): boolean {
  const allowed = FULFILLMENT_TYPES_BY_DOMAIN[domain];
  if (!allowed) return true; // No domain-specific restriction
  return allowed.includes(fulfillmentType);
}

/**
 * Get allowed fulfillment types for a domain.
 */
export function getAllowedFulfillmentTypes(domain: string): string[] {
  return FULFILLMENT_TYPES_BY_DOMAIN[domain] ?? ["Delivery", "Self-Pickup"];
}

/**
 * Get item validation rules for a domain.
 */
export function getDomainItemRules(domain: string): DomainItemRule {
  return DOMAIN_ITEM_RULES[domain] ?? DEFAULT_ITEM_RULES;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Extract tag codes from an object's "tags" field.
 * Supports both flat tag format and nested list format.
 */
function extractTags(obj: Record<string, unknown>): Set<string> {
  const codes = new Set<string>();
  const tags = obj["tags"] as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(tags)) return codes;

  for (const tag of tags) {
    if (tag["code"]) {
      codes.add(tag["code"] as string);
    }
    // ONDC nested list format
    const list = tag["list"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(list)) {
      for (const subTag of list) {
        if (subTag["code"]) {
          codes.add(subTag["code"] as string);
        }
      }
    }
    // Descriptor-based tag format (ONDC v1.2)
    const descriptor = tag["descriptor"] as Record<string, unknown> | undefined;
    if (descriptor?.["code"]) {
      codes.add(descriptor["code"] as string);
    }
  }

  return codes;
}
