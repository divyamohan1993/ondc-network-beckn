import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLogger } from "@ondc/shared/utils";
import type {
  BecknRequest,
  BecknContext,
  Item,
  Provider,
  Quote,
  Order,
  Fulfillment,
  Payment,
} from "@ondc/shared/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadJson(relativePath: string): unknown {
  const filePath = join(__dirname, relativePath);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

const locationsData = loadJson("data/locations.json") as Record<
  string,
  { city: string; state: string; locations: Array<{ gps: string; address: string; area_code: string }> }
>;
const providersData = loadJson("data/providers.json") as Record<string, string[]>;

const logger = createLogger("bpp-mock");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogData {
  domain: string;
  items: Item[];
}

export interface BppMockConfig {
  mockServerBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Domain-to-catalog key mapping
// ---------------------------------------------------------------------------

const DOMAIN_CATALOG_KEY: Record<string, string> = {
  "ONDC:NIC2004:49299": "water",
  "ONDC:RET10": "food",
  "ONDC:AGR10": "agriculture",
  "ONDC:LOG10": "logistics",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function getProviderName(domain: string): string {
  const key = DOMAIN_CATALOG_KEY[domain] ?? "water";
  const names = providersData[key] ?? ["Generic Provider"];
  return pickRandom(names);
}

function getLocationForCity(cityCode: string) {
  const cityData = locationsData[cityCode];
  if (!cityData) {
    return { gps: "28.6139,77.2090", address: "Connaught Place, New Delhi", area_code: "110001" };
  }
  return pickRandom(cityData.locations);
}

function buildCallbackContext(
  requestContext: BecknContext,
  callbackAction: string,
): BecknContext {
  return {
    ...requestContext,
    action: callbackAction,
    message_id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

function generateDeliveryCharge(domain: string): number {
  switch (DOMAIN_CATALOG_KEY[domain]) {
    case "water":
      return Math.floor(Math.random() * 50) + 30;
    case "food":
      return Math.floor(Math.random() * 40) + 20;
    case "agriculture":
      return Math.floor(Math.random() * 200) + 100;
    case "logistics":
      return 0; // logistics items already include delivery
    default:
      return Math.floor(Math.random() * 50) + 25;
  }
}

function generateOrderStatus(createdAt: Date): string {
  const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed < 0.5) return "Accepted";
  if (hoursElapsed < 2) return "Packed";
  if (hoursElapsed < 8) return "Shipped";
  if (hoursElapsed < 24) return "Out-for-delivery";
  return "Delivered";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle an incoming BPP action request and generate the appropriate
 * callback response.
 *
 * @param action - The Beckn action (search, select, init, confirm, status, track)
 * @param body - The full Beckn request body
 * @param catalogData - The loaded catalog data for the relevant domain
 * @param config - Mock server configuration
 * @returns The callback response body to send back to the BAP
 */
export function handleBppAction(
  action: string,
  body: BecknRequest,
  catalogData: CatalogData | null,
  config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const context = body.context;

  switch (action) {
    case "search":
      return handleSearch(context, body, catalogData, config);
    case "select":
      return handleSelect(context, body, catalogData, config);
    case "init":
      return handleInit(context, body, config);
    case "confirm":
      return handleConfirm(context, body, config);
    case "status":
      return handleStatus(context, body, config);
    case "track":
      return handleTrack(context, body, config);
    default: {
      logger.warn({ action }, "Unknown BPP action, generating generic ACK callback");
      const callbackAction = `on_${action}`;
      return {
        callbackAction,
        response: {
          context: buildCallbackContext(context, callbackAction),
          message: {},
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handleSearch(
  context: BecknContext,
  _body: BecknRequest,
  catalogData: CatalogData | null,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_search";
  const items = catalogData?.items ?? [];

  // Pick a random subset of items (5-15) for this provider
  const itemCount = Math.min(items.length, Math.floor(Math.random() * 11) + 5);
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const selectedItems = shuffled.slice(0, itemCount);

  const providerName = getProviderName(context.domain);
  const providerId = `provider-${randomUUID().slice(0, 8)}`;
  const location = getLocationForCity(context.city);

  const provider: Provider = {
    id: providerId,
    descriptor: {
      name: providerName,
      short_desc: `${providerName} - Quality products delivered to your doorstep`,
    },
    locations: [
      {
        id: `loc-${providerId}`,
        gps: location.gps,
        address: {
          locality: location.address.split(",")[0]?.trim(),
          city: location.address.split(",").pop()?.trim(),
          area_code: location.area_code,
          country: "IND",
        },
      },
    ],
    items: selectedItems.map((item) => ({
      ...item,
      quantity: {
        available: { count: Math.floor(Math.random() * 100) + 10 },
        maximum: { count: 50 },
      },
    })),
    fulfillments: [
      {
        id: "delivery-standard",
        type: "Delivery",
        tracking: true,
      },
      {
        id: "delivery-express",
        type: "Delivery",
        tracking: true,
      },
    ],
  };

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      catalog: {
        "bpp/descriptor": {
          name: providerName,
          short_desc: `${providerName} on ONDC Network`,
        },
        "bpp/providers": [provider],
        "bpp/fulfillments": [
          { id: "delivery-standard", type: "Delivery" },
          { id: "delivery-express", type: "Delivery" },
        ],
      },
    },
  };

  logger.info(
    { domain: context.domain, provider: providerName, itemCount: selectedItems.length },
    "Generated on_search response",
  );

  return { callbackAction, response };
}

function handleSelect(
  context: BecknContext,
  body: BecknRequest,
  catalogData: CatalogData | null,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_select";
  const order = body.message.order;
  const selectedItems = order?.items ?? [];
  const allItems = catalogData?.items ?? [];

  // Build quote by looking up item prices
  let totalValue = 0;
  const breakup: Quote["breakup"] = [];

  for (const selectedItem of selectedItems) {
    const catalogItem = allItems.find((i) => i.id === selectedItem.id);
    const price = parseFloat(catalogItem?.price?.value ?? "0");
    const qty = selectedItem.quantity?.count ?? 1;
    const lineTotal = price * qty;
    totalValue += lineTotal;

    breakup!.push({
      title: catalogItem?.descriptor?.name ?? selectedItem.id ?? "Item",
      price: { currency: "INR", value: lineTotal.toFixed(2) },
      "@ondc/org/item_id": selectedItem.id,
      "@ondc/org/item_quantity": { count: qty },
      "@ondc/org/title_type": "item",
    });
  }

  // Add delivery charge
  const deliveryCharge = generateDeliveryCharge(context.domain);
  totalValue += deliveryCharge;
  breakup!.push({
    title: "Delivery charges",
    price: { currency: "INR", value: deliveryCharge.toFixed(2) },
    "@ondc/org/title_type": "delivery",
  });

  const quote: Quote = {
    price: { currency: "INR", value: totalValue.toFixed(2) },
    breakup,
    ttl: "PT30M",
  };

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      order: {
        provider: order?.provider,
        items: selectedItems,
        quote,
      },
    },
  };

  logger.info(
    { domain: context.domain, total: totalValue.toFixed(2), items: selectedItems.length },
    "Generated on_select response with quote",
  );

  return { callbackAction, response };
}

function handleInit(
  context: BecknContext,
  body: BecknRequest,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_init";
  const order = body.message.order;

  // Choose COD or prepaid randomly
  const paymentType = Math.random() > 0.4 ? "ON-ORDER" : "ON-FULFILLMENT";

  const payment: Payment = {
    type: paymentType,
    status: "NOT-PAID",
    collected_by: paymentType === "ON-ORDER" ? "BAP" : "BPP",
    "@ondc/org/buyer_app_finder_fee_type": "percent",
    "@ondc/org/buyer_app_finder_fee_amount": "3",
    "@ondc/org/settlement_details": [
      {
        settlement_counterparty: "seller-app",
        settlement_phase: "sale-amount",
        settlement_type: "neft",
        settlement_bank_account_no: "1234567890",
        settlement_ifsc_code: "SBIN0001234",
        bank_name: "State Bank of India",
        beneficiary_name: context.bpp_id ?? "Seller",
      },
    ],
  };

  const location = getLocationForCity(context.city);

  const fulfillment: Fulfillment = {
    id: "fulfillment-001",
    type: "Delivery",
    tracking: true,
    end: {
      location: {
        gps: location.gps,
        address: {
          locality: location.address.split(",")[0]?.trim(),
          city: location.address.split(",").pop()?.trim(),
          area_code: location.area_code,
          country: "IND",
        },
      },
      contact: {
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: "buyer@example.com",
      },
      person: {
        name: "Test Buyer",
      },
    },
  };

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      order: {
        provider: order?.provider,
        items: order?.items,
        billing: order?.billing ?? {
          name: "Test Buyer",
          phone: "9876543210",
          address: {
            city: location.address.split(",").pop()?.trim(),
            area_code: location.area_code,
            country: "IND",
          },
        },
        fulfillments: [fulfillment],
        quote: order?.quote,
        payment,
      },
    },
  };

  logger.info(
    { domain: context.domain, paymentType },
    "Generated on_init response with payment details",
  );

  return { callbackAction, response };
}

function handleConfirm(
  context: BecknContext,
  body: BecknRequest,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_confirm";
  const order = body.message.order;
  const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

  const confirmedOrder: Order = {
    ...order,
    id: orderId,
    state: "Accepted",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Update fulfillment with state
  if (confirmedOrder.fulfillments && confirmedOrder.fulfillments.length > 0) {
    confirmedOrder.fulfillments[0]!.state = {
      descriptor: { code: "Pending", name: "Order accepted, preparing for dispatch" },
      updated_at: new Date().toISOString(),
    };
  }

  // Update payment status if prepaid
  if (confirmedOrder.payment?.type === "ON-ORDER") {
    confirmedOrder.payment.status = "PAID";
    confirmedOrder.payment.params = {
      transaction_id: `TXN-${Date.now()}`,
      transaction_status: "payment-collected",
      amount: confirmedOrder.quote?.price?.value ?? "0",
      currency: "INR",
    };
  }

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      order: confirmedOrder,
    },
  };

  logger.info(
    { domain: context.domain, orderId, state: "Accepted" },
    "Generated on_confirm response",
  );

  return { callbackAction, response };
}

function handleStatus(
  context: BecknContext,
  body: BecknRequest,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_status";
  const orderId = body.message.order?.id ?? `ORD-${Date.now()}`;

  // Simulate order progression based on time
  const orderCreatedAt = body.message.order?.created_at
    ? new Date(body.message.order.created_at)
    : new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000);

  const status = generateOrderStatus(orderCreatedAt);

  const location = getLocationForCity(context.city);

  const fulfillment: Fulfillment = {
    id: "fulfillment-001",
    type: "Delivery",
    tracking: true,
    state: {
      descriptor: { code: status, name: `Order is ${status.toLowerCase()}` },
      updated_at: new Date().toISOString(),
    },
    start: {
      location: {
        gps: location.gps,
        address: {
          locality: location.address.split(",")[0]?.trim(),
          city: location.address.split(",").pop()?.trim(),
          area_code: location.area_code,
        },
      },
      time: {
        timestamp: orderCreatedAt.toISOString(),
      },
    },
  };

  // Add agent info for shipped/out-for-delivery
  if (status === "Shipped" || status === "Out-for-delivery") {
    fulfillment.agent = {
      name: pickRandom(["Ravi Kumar", "Amit Singh", "Suresh Yadav", "Mohammed Irfan", "Deepak Sharma"]),
      phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    };
  }

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      order: {
        id: orderId,
        state: status,
        provider: body.message.order?.provider,
        items: body.message.order?.items,
        fulfillments: [fulfillment],
        quote: body.message.order?.quote,
        payment: body.message.order?.payment,
        updated_at: new Date().toISOString(),
      },
    },
  };

  logger.info(
    { domain: context.domain, orderId, status },
    "Generated on_status response",
  );

  return { callbackAction, response };
}

function handleTrack(
  context: BecknContext,
  body: BecknRequest,
  _config: BppMockConfig,
): { callbackAction: string; response: BecknRequest } {
  const callbackAction = "on_track";
  const orderId = body.message.order?.id ?? `ORD-${Date.now()}`;

  // Get random GPS near the city
  const location = getLocationForCity(context.city);
  const [lat, lng] = location.gps.split(",").map(Number);

  // Slightly offset the GPS to simulate movement
  const offsetLat = (lat ?? 28.6139) + (Math.random() - 0.5) * 0.02;
  const offsetLng = (lng ?? 77.2090) + (Math.random() - 0.5) * 0.02;

  const response: BecknRequest = {
    context: buildCallbackContext(context, callbackAction),
    message: {
      tracking: {
        url: `https://track.example.com/order/${orderId}`,
        status: "active",
        location: {
          gps: `${offsetLat.toFixed(4)},${offsetLng.toFixed(4)}`,
          time: { timestamp: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
      },
    },
  };

  logger.info(
    { domain: context.domain, orderId, gps: `${offsetLat.toFixed(4)},${offsetLng.toFixed(4)}` },
    "Generated on_track response",
  );

  return { callbackAction, response };
}
