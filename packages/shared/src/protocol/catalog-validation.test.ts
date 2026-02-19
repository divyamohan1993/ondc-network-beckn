import { describe, it, expect } from "vitest";
import {
  validateCatalogItems,
  validateQuote,
  validatePayment,
  validateFulfillmentType,
} from "./catalog-validation.js";

// ---------------------------------------------------------------------------
// Helpers - build minimal valid objects
// ---------------------------------------------------------------------------

function validGroceryProvider(): Record<string, unknown> {
  return {
    descriptor: { name: "Fresh Mart" },
    tags: [
      { code: "serviceability" },
      { code: "catalog_link" },
      { code: "timing" },
    ],
  };
}

function validGroceryItem(): Record<string, unknown> {
  return {
    id: "item-001",
    descriptor: {
      name: "Organic Whole Milk",
      short_desc: "1 litre organic whole milk",
      long_desc: "Sourced from free-range cows, pasteurised and homogenised.",
      images: ["https://example.com/milk.jpg"],
    },
    price: {
      currency: "INR",
      value: "65.00",
      maximum_value: "70.00",
    },
    category_id: "dairy",
    fulfillment_id: "fulfillment-1",
    quantity: {
      available: { count: 100 },
      unitized: {
        measure: { unit: "litre", value: "1" },
      },
    },
    tags: [
      { code: "veg_nonveg" },
      { code: "packaged_commodities" },
      { code: "time_to_ship" },
    ],
  };
}

function validQuote(): Record<string, unknown> {
  return {
    price: {
      currency: "INR",
      value: "115.00",
    },
    breakup: [
      {
        "@ondc/org/title_type": "item",
        price: { currency: "INR", value: "65.00" },
      },
      {
        "@ondc/org/title_type": "delivery",
        price: { currency: "INR", value: "30.00" },
      },
      {
        "@ondc/org/title_type": "packing",
        price: { currency: "INR", value: "10.00" },
      },
      {
        "@ondc/org/title_type": "tax",
        price: { currency: "INR", value: "10.00" },
      },
    ],
  };
}

function validPayment(): Record<string, unknown> {
  return {
    type: "ON-FULFILLMENT",
    collected_by: "BPP",
    "@ondc/org/buyer_app_finder_fee_type": "percent",
    "@ondc/org/buyer_app_finder_fee_amount": "3.0",
    "@ondc/org/settlement_details": [
      {
        settlement_counterparty: "seller-app",
        settlement_type: "neft",
        settlement_bank_account_no: "1234567890",
        settlement_ifsc_code: "HDFC0001234",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// validateCatalogItems
// ---------------------------------------------------------------------------

describe("validateCatalogItems", () => {
  it("should pass for a valid grocery item", () => {
    const result = validateCatalogItems(
      "ONDC:RET10",
      validGroceryProvider(),
      [validGroceryItem()],
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when required item fields are missing", () => {
    const item = validGroceryItem();
    delete item.id;
    delete item.price;

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"id"'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('"price"'))).toBe(true);
  });

  it("should fail when images are missing for a domain that requires them", () => {
    const item = validGroceryItem();
    const descriptor = item.descriptor as Record<string, unknown>;
    delete descriptor.images;

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("image"))).toBe(true);
  });

  it("should fail when selling price exceeds maximum_value (MRP)", () => {
    const item = validGroceryItem();
    const price = item.price as Record<string, unknown>;
    price.value = "100.00";
    price.maximum_value = "70.00"; // selling > MRP

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cannot exceed MRP"))).toBe(true);
  });

  it("should warn when item name exceeds maximum length", () => {
    const item = validGroceryItem();
    const descriptor = item.descriptor as Record<string, unknown>;
    descriptor.name = "A".repeat(250); // ONDC:RET10 maxNameLength = 200

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    // The name-length check is a warning, not an error
    expect(result.warnings.some((w) => w.message.includes("exceeds maximum length"))).toBe(true);
  });

  it("should fail when required item tags are missing per domain", () => {
    const item = validGroceryItem();
    // Remove all tags - grocery requires veg_nonveg, packaged_commodities, time_to_ship
    item.tags = [];

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("veg_nonveg"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("packaged_commodities"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("time_to_ship"))).toBe(true);
  });

  it("should fail when provider descriptor is missing", () => {
    const provider: Record<string, unknown> = {
      tags: [
        { code: "serviceability" },
        { code: "catalog_link" },
        { code: "timing" },
      ],
    };

    const result = validateCatalogItems("ONDC:RET10", provider, [validGroceryItem()]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Provider descriptor"))).toBe(true);
  });

  it("should fail when required provider tags are missing", () => {
    const provider: Record<string, unknown> = {
      descriptor: { name: "Provider" },
      tags: [], // Missing serviceability, catalog_link, timing
    };

    const result = validateCatalogItems("ONDC:RET10", provider, [validGroceryItem()]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("serviceability"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("catalog_link"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("timing"))).toBe(true);
  });

  it("should warn when currency is not INR", () => {
    const item = validGroceryItem();
    const price = item.price as Record<string, unknown>;
    price.currency = "USD";

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.warnings.some((w) => w.message.includes("INR"))).toBe(true);
  });

  it("should fail when descriptor required fields are missing (short_desc, long_desc)", () => {
    const item = validGroceryItem();
    const descriptor = item.descriptor as Record<string, unknown>;
    delete descriptor.short_desc;
    delete descriptor.long_desc;

    const result = validateCatalogItems("ONDC:RET10", validGroceryProvider(), [item]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"short_desc"'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('"long_desc"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateQuote
// ---------------------------------------------------------------------------

describe("validateQuote", () => {
  it("should pass for a valid quote", () => {
    const result = validateQuote("ONDC:RET10", validQuote());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when price is missing", () => {
    const quote = validQuote();
    delete quote.price;

    const result = validateQuote("ONDC:RET10", quote);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("price"))).toBe(true);
  });

  it("should fail when breakup is missing", () => {
    const quote = validQuote();
    delete quote.breakup;

    const result = validateQuote("ONDC:RET10", quote);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("breakup"))).toBe(true);
  });

  it("should warn when required breakup types are missing", () => {
    const quote = validQuote();
    // Keep only the "item" breakup entry, removing delivery/packing/tax
    (quote.breakup as Record<string, unknown>[]).splice(1);

    const result = validateQuote("ONDC:RET10", quote);
    // Total mismatch may cause an error, but we also check for missing type warnings
    expect(result.warnings.some((w) => w.message.includes("delivery"))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("packing"))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("tax"))).toBe(true);
  });

  it("should fail when quote total does not match breakup sum", () => {
    const quote = validQuote();
    // Set total to a value that differs from the breakup sum (65+30+10+10=115)
    (quote.price as Record<string, unknown>).value = "200.00";

    const result = validateQuote("ONDC:RET10", quote);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("doesn't match breakup sum"))).toBe(
      true,
    );
  });

  it("should fail when a breakup entry is missing price", () => {
    const quote = validQuote();
    const breakup = quote.breakup as Record<string, unknown>[];
    delete breakup[0].price;

    const result = validateQuote("ONDC:RET10", quote);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes("breakup[0].price"))).toBe(true);
  });

  it("should pass for a domain without required breakup types", () => {
    const quote: Record<string, unknown> = {
      price: { currency: "INR", value: "100.00" },
      breakup: [
        {
          "@ondc/org/title_type": "item",
          price: { currency: "INR", value: "100.00" },
        },
      ],
    };

    // Use a domain with no specific breakup type requirements
    const result = validateQuote("ONDC:SRV11", quote);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validatePayment
// ---------------------------------------------------------------------------

describe("validatePayment", () => {
  it("should pass for a valid payment", () => {
    const result = validatePayment(validPayment());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when payment type is missing", () => {
    const payment = validPayment();
    delete payment.type;

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Payment type is required"))).toBe(true);
  });

  it("should fail when payment type is invalid", () => {
    const payment = validPayment();
    payment.type = "CASH";

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Invalid payment type"))).toBe(true);
  });

  it("should fail when collected_by is invalid", () => {
    const payment = validPayment();
    payment.collected_by = "GATEWAY";

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Invalid collected_by"))).toBe(true);
  });

  it("should accept valid collected_by values (BAP, BPP)", () => {
    for (const value of ["BAP", "BPP"]) {
      const payment = validPayment();
      payment.collected_by = value;
      const result = validatePayment(payment);
      expect(
        result.errors.some((e) => e.field === "payment.collected_by"),
      ).toBe(false);
    }
  });

  it("should fail when finder fee type is invalid", () => {
    const payment = validPayment();
    payment["@ondc/org/buyer_app_finder_fee_type"] = "fixed";

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Invalid finder fee type"))).toBe(true);
  });

  it("should accept valid finder fee types (percent, amount)", () => {
    for (const value of ["percent", "amount"]) {
      const payment = validPayment();
      payment["@ondc/org/buyer_app_finder_fee_type"] = value;
      const result = validatePayment(payment);
      expect(
        result.errors.some((e) => e.field.includes("finder_fee_type")),
      ).toBe(false);
    }
  });

  it("should fail when finder fee amount is not a valid number", () => {
    const payment = validPayment();
    payment["@ondc/org/buyer_app_finder_fee_amount"] = "abc";

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes("finder fee amount must be a valid number")),
    ).toBe(true);
  });

  it("should fail when settlement type is missing in settlement details", () => {
    const payment = validPayment();
    const settlements = payment["@ondc/org/settlement_details"] as Record<string, unknown>[];
    delete settlements[0].settlement_type;

    const result = validatePayment(payment);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Settlement type is required"))).toBe(
      true,
    );
  });

  it("should accept all valid payment types", () => {
    for (const type of ["PRE-FULFILLMENT", "ON-FULFILLMENT", "POST-FULFILLMENT"]) {
      const payment = validPayment();
      payment.type = type;
      const result = validatePayment(payment);
      expect(result.errors.some((e) => e.field === "payment.type")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// validateFulfillmentType
// ---------------------------------------------------------------------------

describe("validateFulfillmentType", () => {
  it("should return true for valid grocery fulfillment types", () => {
    expect(validateFulfillmentType("ONDC:RET10", "Delivery")).toBe(true);
    expect(validateFulfillmentType("ONDC:RET10", "Self-Pickup")).toBe(true);
  });

  it("should return true for valid F&B fulfillment types including Dine-in", () => {
    expect(validateFulfillmentType("ONDC:RET11", "Delivery")).toBe(true);
    expect(validateFulfillmentType("ONDC:RET11", "Self-Pickup")).toBe(true);
    expect(validateFulfillmentType("ONDC:RET11", "Dine-in")).toBe(true);
  });

  it("should return true for valid logistics fulfillment types", () => {
    expect(validateFulfillmentType("ONDC:LOG10", "Delivery")).toBe(true);
    expect(validateFulfillmentType("ONDC:LOG10", "RTO")).toBe(true);
  });

  it("should return true for valid services fulfillment types", () => {
    expect(validateFulfillmentType("ONDC:SRV11", "Online")).toBe(true);
    expect(validateFulfillmentType("ONDC:SRV11", "Offline")).toBe(true);
  });

  it("should return true for valid travel fulfillment types", () => {
    expect(validateFulfillmentType("ONDC:TRV10", "RIDE")).toBe(true);
    expect(validateFulfillmentType("ONDC:TRV10", "RENTAL")).toBe(true);
    expect(validateFulfillmentType("ONDC:TRV11", "ROUTE")).toBe(true);
    expect(validateFulfillmentType("ONDC:TRV11", "TRIP")).toBe(true);
  });

  it("should return false for invalid fulfillment types in a known domain", () => {
    expect(validateFulfillmentType("ONDC:RET10", "Dine-in")).toBe(false);
    expect(validateFulfillmentType("ONDC:RET10", "RTO")).toBe(false);
    expect(validateFulfillmentType("ONDC:LOG10", "Self-Pickup")).toBe(false);
    expect(validateFulfillmentType("ONDC:SRV18", "Online")).toBe(false);
    expect(validateFulfillmentType("ONDC:TRV10", "Delivery")).toBe(false);
  });

  it("should return true for any fulfillment type in an unknown domain", () => {
    expect(validateFulfillmentType("UNKNOWN:DOMAIN", "Delivery")).toBe(true);
    expect(validateFulfillmentType("UNKNOWN:DOMAIN", "Anything")).toBe(true);
    expect(validateFulfillmentType("UNKNOWN:DOMAIN", "FlyingCarpet")).toBe(true);
  });
});
