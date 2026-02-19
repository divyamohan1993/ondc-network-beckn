import { randomUUID } from "node:crypto";
import { request as httpRequest } from "undici";
import { createLogger } from "@ondc/shared/utils";
import { buildContext } from "@ondc/shared/protocol";
import type {
  BecknRequest,
  BecknContext,
  Item,
  Provider,
  Order,
} from "@ondc/shared/protocol";

const logger = createLogger("bap-mock");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BapMockConfig {
  /** Base URL of the BAP adapter to send follow-up actions to */
  bapAdapterUrl: string;
  /** Whether to auto-continue the order flow on each callback */
  autoContinue: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendRequest(url: string, body: object): Promise<void> {
  try {
    const { statusCode } = await httpRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    logger.info({ url, statusCode }, "Follow-up request sent");
  } catch (err) {
    logger.error({ err, url }, "Failed to send follow-up request");
  }
}

function pickRandomItem(providers: Provider[]): { provider: Provider; item: Item } | null {
  if (!providers || providers.length === 0) return null;
  const provider = providers[Math.floor(Math.random() * providers.length)]!;
  const items = provider.items ?? [];
  if (items.length === 0) return null;
  const item = items[Math.floor(Math.random() * items.length)]!;
  return { provider, item };
}

function buildFollowUpContext(
  originalContext: BecknContext,
  action: string,
): BecknContext {
  return buildContext({
    domain: originalContext.domain,
    city: originalContext.city,
    action,
    bap_id: originalContext.bap_id,
    bap_uri: originalContext.bap_uri,
    bpp_id: originalContext.bpp_id,
    bpp_uri: originalContext.bpp_uri,
    transaction_id: originalContext.transaction_id,
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle a callback received by a simulated BAP. Optionally continues the
 * order flow by sending the next action in the chain.
 *
 * Flow:
 *   on_search -> select
 *   on_select -> init
 *   on_init   -> confirm
 *   on_confirm -> status
 *
 * @param action - The callback action (on_search, on_select, on_init, on_confirm, on_status)
 * @param body - The full Beckn callback body
 * @param config - BAP mock configuration
 * @returns A summary of the callback handling
 */
export async function handleBapCallback(
  action: string,
  body: BecknRequest,
  config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const context = body.context;
  const transactionId = context.transaction_id;

  logger.info(
    { action, transactionId, domain: context.domain },
    "BAP callback received",
  );

  switch (action) {
    case "on_search":
      return handleOnSearch(context, body, config);
    case "on_select":
      return handleOnSelect(context, body, config);
    case "on_init":
      return handleOnInit(context, body, config);
    case "on_confirm":
      return handleOnConfirm(context, body, config);
    case "on_status":
      return handleOnStatus(context, body, config);
    case "on_track":
      return handleOnTrack(context, body, config);
    default:
      logger.info({ action, transactionId }, "Unrecognized callback action, no follow-up");
      return { handled: true, details: `Logged callback for ${action}` };
  }
}

// ---------------------------------------------------------------------------
// Callback handlers
// ---------------------------------------------------------------------------

async function handleOnSearch(
  context: BecknContext,
  body: BecknRequest,
  config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const catalog = body.message.catalog;
  const providers = catalog?.["bpp/providers"] ?? [];
  const totalItems = providers.reduce(
    (sum, p) => sum + (p.items?.length ?? 0),
    0,
  );

  logger.info(
    { transactionId: context.transaction_id, providers: providers.length, totalItems },
    "on_search: Received catalog",
  );

  if (!config.autoContinue) {
    return { handled: true, details: `Received catalog with ${providers.length} providers, ${totalItems} items` };
  }

  // Auto-continue: pick a random item and send select
  const selection = pickRandomItem(providers);
  if (!selection) {
    return { handled: true, details: "No items found in catalog, cannot continue" };
  }

  const selectContext = buildFollowUpContext(context, "select");
  const selectRequest: BecknRequest = {
    context: selectContext,
    message: {
      order: {
        provider: {
          id: selection.provider.id,
          locations: selection.provider.locations?.map((l) => ({ id: l.id })),
        },
        items: [
          {
            id: selection.item.id,
            quantity: { count: Math.floor(Math.random() * 3) + 1 },
            fulfillment_id: selection.item.fulfillment_id ?? "delivery-standard",
          },
        ],
      },
    },
  };

  // Send select to the BPP (via the gateway or directly)
  const targetUrl = context.bpp_uri
    ? `${context.bpp_uri}/select`
    : `${config.bapAdapterUrl}/select`;

  await sendRequest(targetUrl, selectRequest);

  return {
    handled: true,
    nextAction: "select",
    details: `Selected item ${selection.item.id} from provider ${selection.provider.id}`,
  };
}

async function handleOnSelect(
  context: BecknContext,
  body: BecknRequest,
  config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const quote = body.message.order?.quote;

  logger.info(
    {
      transactionId: context.transaction_id,
      total: quote?.price?.value,
      breakupItems: quote?.breakup?.length,
    },
    "on_select: Received quote",
  );

  if (!config.autoContinue) {
    return { handled: true, details: `Received quote: ${quote?.price?.currency} ${quote?.price?.value}` };
  }

  // Auto-continue: send init with billing details
  const initContext = buildFollowUpContext(context, "init");
  const order = body.message.order;

  const initRequest: BecknRequest = {
    context: initContext,
    message: {
      order: {
        provider: order?.provider,
        items: order?.items,
        billing: {
          name: "Test Buyer",
          phone: "9876543210",
          email: "buyer@example.com",
          address: {
            city: context.city,
            country: "IND",
            area_code: "110001",
          },
        },
        fulfillments: [
          {
            id: "fulfillment-001",
            type: "Delivery",
            end: {
              location: {
                gps: "28.6139,77.2090",
                address: {
                  locality: "Connaught Place",
                  city: "New Delhi",
                  area_code: "110001",
                  country: "IND",
                },
              },
              contact: {
                phone: "9876543210",
                email: "buyer@example.com",
              },
              person: {
                name: "Test Buyer",
              },
            },
          },
        ],
        quote,
      },
    },
  };

  const targetUrl = context.bpp_uri
    ? `${context.bpp_uri}/init`
    : `${config.bapAdapterUrl}/init`;

  await sendRequest(targetUrl, initRequest);

  return {
    handled: true,
    nextAction: "init",
    details: `Sent init with billing details for quote ${quote?.price?.value}`,
  };
}

async function handleOnInit(
  context: BecknContext,
  body: BecknRequest,
  config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const payment = body.message.order?.payment;

  logger.info(
    {
      transactionId: context.transaction_id,
      paymentType: payment?.type,
      collectedBy: payment?.collected_by,
    },
    "on_init: Received payment details",
  );

  if (!config.autoContinue) {
    return { handled: true, details: `Received payment details: type=${payment?.type}` };
  }

  // Auto-continue: send confirm
  const confirmContext = buildFollowUpContext(context, "confirm");
  const order = body.message.order;

  // If payment is ON-ORDER (prepaid), simulate a payment transaction
  const updatedPayment = { ...payment };
  if (payment?.type === "ON-ORDER") {
    updatedPayment.status = "PAID";
    updatedPayment.params = {
      transaction_id: `TXN-${Date.now()}`,
      transaction_status: "payment-collected",
      amount: order?.quote?.price?.value ?? "0",
      currency: "INR",
    };
  }

  const confirmRequest: BecknRequest = {
    context: confirmContext,
    message: {
      order: {
        ...order,
        payment: updatedPayment,
      },
    },
  };

  const targetUrl = context.bpp_uri
    ? `${context.bpp_uri}/confirm`
    : `${config.bapAdapterUrl}/confirm`;

  await sendRequest(targetUrl, confirmRequest);

  return {
    handled: true,
    nextAction: "confirm",
    details: `Confirmed order with payment type ${payment?.type}`,
  };
}

async function handleOnConfirm(
  context: BecknContext,
  body: BecknRequest,
  config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const order = body.message.order;
  const orderId = order?.id;
  const state = order?.state;

  logger.info(
    {
      transactionId: context.transaction_id,
      orderId,
      state,
    },
    "on_confirm: Order confirmed",
  );

  if (!config.autoContinue) {
    return { handled: true, details: `Order ${orderId} confirmed with state ${state}` };
  }

  // Auto-continue: send status check after a brief conceptual delay
  const statusContext = buildFollowUpContext(context, "status");

  const statusRequest: BecknRequest = {
    context: statusContext,
    message: {
      order: {
        id: orderId,
      },
    },
  };

  const targetUrl = context.bpp_uri
    ? `${context.bpp_uri}/status`
    : `${config.bapAdapterUrl}/status`;

  await sendRequest(targetUrl, statusRequest);

  return {
    handled: true,
    nextAction: "status",
    details: `Order ${orderId} confirmed, sent status request`,
  };
}

async function handleOnStatus(
  context: BecknContext,
  body: BecknRequest,
  _config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const order = body.message.order;
  const orderId = order?.id;
  const state = order?.state;
  const fulfillment = order?.fulfillments?.[0];

  logger.info(
    {
      transactionId: context.transaction_id,
      orderId,
      state,
      fulfillmentState: fulfillment?.state?.descriptor?.code,
      agent: fulfillment?.agent?.name,
    },
    "on_status: Order status received",
  );

  // Terminal action: do not auto-continue further
  return {
    handled: true,
    details: `Order ${orderId} status: ${state}`,
  };
}

async function handleOnTrack(
  context: BecknContext,
  body: BecknRequest,
  _config: BapMockConfig,
): Promise<{ handled: boolean; nextAction?: string; details?: string }> {
  const tracking = body.message.tracking as
    | { url?: string; status?: string; location?: { gps?: string } }
    | undefined;

  logger.info(
    {
      transactionId: context.transaction_id,
      trackingUrl: tracking?.url,
      gps: tracking?.location?.gps,
    },
    "on_track: Tracking info received",
  );

  return {
    handled: true,
    details: `Tracking active at ${tracking?.location?.gps ?? "unknown"}`,
  };
}
