/**
 * Shared test fixtures for ONDC Network Beckn test suites.
 *
 * Provides factory functions, mock data, and reusable test helpers
 * used across all unit, integration, and E2E tests.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Beckn Context Fixtures
// ---------------------------------------------------------------------------

export function createValidBecknContext(overrides: Record<string, unknown> = {}) {
  return {
    domain: "ONDC:RET10",
    country: "IND",
    city: "std:080",
    location: {
      country: { code: "IND" },
      city: { code: "std:080" },
    },
    action: "search",
    core_version: "1.2.0",
    version: "1.2.0",
    bap_id: "bap.example.com",
    bap_uri: "https://bap.example.com/beckn",
    transaction_id: randomUUID(),
    message_id: randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: "PT30S",
    ...overrides,
  };
}

export function createValidSearchRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: createValidBecknContext({ action: "search", ...overrides }),
    message: {
      intent: {
        descriptor: { name: "laptop" },
        fulfillment: { type: "Delivery" },
      },
    },
  };
}

export function createValidSelectRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: createValidBecknContext({
      action: "select",
      bpp_id: "bpp.example.com",
      bpp_uri: "https://bpp.example.com/beckn",
      ...overrides,
    }),
    message: {
      order: {
        provider: { id: "provider-1" },
        items: [{ id: "item-1", quantity: { count: 1 } }],
      },
    },
  };
}

export function createValidConfirmRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: createValidBecknContext({
      action: "confirm",
      bpp_id: "bpp.example.com",
      bpp_uri: "https://bpp.example.com/beckn",
      ...overrides,
    }),
    message: {
      order: {
        provider: { id: "provider-1", locations: [{ id: "loc-1" }] },
        items: [{ id: "item-1", quantity: { count: 1 }, fulfillment_id: "f1" }],
        billing: {
          name: "John Doe",
          phone: "9876543210",
          address: {
            door: "123",
            name: "Main Street",
            city: "Bangalore",
            state: "Karnataka",
            country: "IND",
            area_code: "560001",
          },
        },
        fulfillments: [{
          id: "f1",
          type: "Delivery",
          end: {
            location: {
              gps: "12.9716,77.5946",
              address: {
                door: "456",
                name: "Delivery Street",
                city: "Bangalore",
                state: "Karnataka",
                country: "IND",
                area_code: "560001",
              },
            },
            contact: { phone: "9876543210" },
          },
        }],
        payment: {
          type: "PRE-FULFILLMENT",
          collected_by: "BAP",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3",
          "@ondc/org/settlement_details": [{
            settlement_counterparty: "seller-app",
            settlement_type: "neft",
            settlement_bank_account_no: "1234567890",
            settlement_ifsc_code: "SBIN0001234",
            beneficiary_name: "Seller",
          }],
        },
        quote: {
          price: { currency: "INR", value: "1000" },
          breakup: [
            { title: "Item", "@ondc/org/title_type": "item", price: { currency: "INR", value: "900" } },
            { title: "Delivery", "@ondc/org/title_type": "delivery", price: { currency: "INR", value: "50" } },
            { title: "Tax", "@ondc/org/title_type": "tax", price: { currency: "INR", value: "50" } },
          ],
        },
      },
    },
  };
}

export function createCallbackContext(overrides: Record<string, unknown> = {}) {
  return createValidBecknContext({
    action: "on_search",
    bpp_id: "bpp.example.com",
    bpp_uri: "https://bpp.example.com/beckn",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Subscriber Fixtures
// ---------------------------------------------------------------------------

export function createMockSubscriber(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    subscriber_id: "test-subscriber.example.com",
    subscriber_url: "https://test-subscriber.example.com/beckn",
    type: "BAP" as const,
    domain: "ONDC:RET10",
    city: "std:080",
    signing_public_key: "dGVzdC1wdWJsaWMta2V5LWJhc2U2NA==",
    encr_public_key: "dGVzdC1lbmNyLWtleS1iYXNlNjQ=",
    unique_key_id: "key-1",
    status: "SUBSCRIBED" as const,
    valid_from: new Date(Date.now() - 86400000).toISOString(),
    valid_until: new Date(Date.now() + 86400000 * 365).toISOString(),
    is_simulated: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockBPP(overrides: Record<string, unknown> = {}) {
  return createMockSubscriber({
    subscriber_id: "bpp.example.com",
    subscriber_url: "https://bpp.example.com/beckn",
    type: "BPP",
    ...overrides,
  });
}

export function createMockGateway(overrides: Record<string, unknown> = {}) {
  return createMockSubscriber({
    subscriber_id: "gateway.example.com",
    subscriber_url: "https://gateway.example.com/beckn",
    type: "BG",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Catalog Fixtures
// ---------------------------------------------------------------------------

export function createValidCatalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    descriptor: {
      name: "Test Product",
      short_desc: "A test product",
      long_desc: "A longer description of the test product",
      images: ["https://example.com/image1.jpg"],
    },
    price: {
      currency: "INR",
      value: "100.00",
      maximum_value: "150.00",
    },
    category_id: "cat-1",
    fulfillment_id: "f-1",
    quantity: {
      available: { count: 100 },
      maximum: { count: 10 },
      unitized: {
        measure: { unit: "unit", value: "1" },
      },
    },
    tags: [
      { code: "veg_nonveg", list: [{ code: "veg", value: "yes" }] },
      { code: "packaged_commodities", list: [{ code: "manufacturer_or_packer_name", value: "TestCo" }] },
      { code: "time_to_ship", list: [{ code: "value", value: "PT1H" }] },
    ],
    ...overrides,
  };
}

export function createValidProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-1",
    descriptor: { name: "Test Store" },
    tags: [
      { code: "serviceability" },
      { code: "catalog_link" },
      { code: "timing" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Quote Fixtures
// ---------------------------------------------------------------------------

export function createValidQuote(overrides: Record<string, unknown> = {}) {
  return {
    price: { currency: "INR", value: "1150.00" },
    breakup: [
      { "@ondc/org/title_type": "item", price: { currency: "INR", value: "1000.00" } },
      { "@ondc/org/title_type": "delivery", price: { currency: "INR", value: "50.00" } },
      { "@ondc/org/title_type": "packing", price: { currency: "INR", value: "20.00" } },
      { "@ondc/org/title_type": "tax", price: { currency: "INR", value: "80.00" } },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Payment Fixtures
// ---------------------------------------------------------------------------

export function createValidPayment(overrides: Record<string, unknown> = {}) {
  return {
    type: "PRE-FULFILLMENT",
    collected_by: "BAP",
    "@ondc/org/buyer_app_finder_fee_type": "percent",
    "@ondc/org/buyer_app_finder_fee_amount": "3",
    "@ondc/org/settlement_details": [{
      settlement_counterparty: "seller-app",
      settlement_type: "neft",
    }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Redis Client
// ---------------------------------------------------------------------------

export function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    get: async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string, mode?: string, ttl?: number): Promise<string | null> => {
      const expiresAt = mode === "EX" && ttl ? Date.now() + ttl * 1000 : undefined;
      store.set(key, { value, expiresAt });
      return "OK";
    },
    setex: async (key: string, seconds: number, value: string): Promise<string> => {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return "OK";
    },
    incr: async (key: string): Promise<number> => {
      const entry = store.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const newVal = current + 1;
      store.set(key, { value: String(newVal), expiresAt: entry?.expiresAt });
      return newVal;
    },
    expire: async (key: string, seconds: number): Promise<number> => {
      const entry = store.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },
    ttl: async (key: string): Promise<number> => {
      const entry = store.get(key);
      if (!entry || !entry.expiresAt) return -1;
      return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
    },
    del: async (key: string): Promise<number> => {
      return store.delete(key) ? 1 : 0;
    },
    _store: store,
    _clear: () => store.clear(),
  };
}

// ---------------------------------------------------------------------------
// Mock Fastify Request/Reply
// ---------------------------------------------------------------------------

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    headers: {},
    ip: "127.0.0.1",
    url: "/test",
    method: "POST",
    ...overrides,
  } as any;
}

export function createMockReply() {
  const headers: Record<string, unknown> = {};
  let statusCode = 200;
  let sentBody: unknown = undefined;

  const reply = {
    code: (code: number) => {
      statusCode = code;
      return reply;
    },
    send: (body: unknown) => {
      sentBody = body;
      return reply;
    },
    header: (name: string, value: unknown) => {
      headers[name] = value;
      return reply;
    },
    get statusCode() {
      return statusCode;
    },
    get sentBody() {
      return sentBody;
    },
    get headers() {
      return headers;
    },
  };

  return reply as any;
}
