import { request as httpRequest } from "undici";
import { eq } from "drizzle-orm";
import {
  buildAuthHeader,
  buildContext,
  createLogger,
  logisticsOrders,
  buildTraceHeadersFromContext,
} from "@ondc/shared";
import type { BecknRequest, Database } from "@ondc/shared";

const logger = createLogger("bpp-logistics");

export interface LogisticsConfig {
  /** Gateway URL for logistics search */
  gatewayUrl: string;
  /** BPP subscriber ID (acts as BAP for logistics) */
  bppId: string;
  /** BPP subscriber URI */
  bppUri: string;
  /** BPP private key for signing */
  privateKey: string;
  /** BPP unique key ID */
  uniqueKeyId: string;
}

/**
 * Optional trace context for distributed tracing propagation.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Logistics fulfillment states per ONDC spec.
 */
export enum LogisticsFulfillmentState {
  SEARCHING_FOR_AGENT = "Searching-for-Agent",
  AGENT_ASSIGNED = "Agent-Assigned",
  AT_PICKUP = "At-pickup-location",
  EN_ROUTE = "En-route-to-drop",
  AT_DROP = "At-drop-location",
  DELIVERED = "Delivered-package",
  CANCELLED = "Cancelled-package",
  RETURNED = "Returned-package",
}

/**
 * Logistics order states for internal tracking.
 */
export enum LogisticsOrderState {
  SEARCHING = "SEARCHING",
  QUOTES_RECEIVED = "QUOTES_RECEIVED",
  SELECTED = "SELECTED",
  INITIALIZED = "INITIALIZED",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface LogisticsSearchParams {
  retailOrderId: string;
  pickupAddress: {
    gps: string;
    area_code?: string;
    city?: string;
    state?: string;
    address?: string;
  };
  deliveryAddress: {
    gps: string;
    area_code?: string;
    city?: string;
    state?: string;
    address?: string;
  };
  packageWeight?: number;
  packageDimensions?: { length: number; breadth: number; height: number };
  categoryId?: string;
  cityCode?: string;
}

/**
 * Search for logistics service providers on the ONDC network.
 *
 * Sends an async search request to the ONDC logistics gateway. The gateway
 * broadcasts to all registered LSPs and relays their on_search callbacks
 * back to the BPP's URI.
 *
 * Creates a logistics_orders record to track the lifecycle.
 */
export async function searchLogistics(
  config: LogisticsConfig,
  db: Database,
  params: LogisticsSearchParams,
  traceContext?: TraceContext,
): Promise<string> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "search",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    city: params.cityCode ?? "std:080",
  });

  // Build intent with ONDC logistics extension fields (not in base SearchIntent type)
  const intent: Record<string, unknown> = {
    category: {
      id: params.categoryId ?? "Standard Delivery",
    },
    fulfillment: {
      type: "Delivery",
      start: {
        location: {
          gps: params.pickupAddress.gps,
          address: {
            area_code: params.pickupAddress.area_code,
            city: params.pickupAddress.city,
            state: params.pickupAddress.state,
            name: params.pickupAddress.address,
          },
        },
      },
      end: {
        location: {
          gps: params.deliveryAddress.gps,
          address: {
            area_code: params.deliveryAddress.area_code,
            city: params.deliveryAddress.city,
            state: params.deliveryAddress.state,
            name: params.deliveryAddress.address,
          },
        },
      },
    },
    payment: { type: "POST-FULFILLMENT" },
    "@ondc/org/payload_details": {
      weight: {
        unit: "kilogram",
        value: params.packageWeight ?? 1,
      },
      ...(params.packageDimensions
        ? {
            dimensions: {
              length: { unit: "centimeter", value: params.packageDimensions.length },
              breadth: { unit: "centimeter", value: params.packageDimensions.breadth },
              height: { unit: "centimeter", value: params.packageDimensions.height },
            },
          }
        : {}),
    },
  };

  const searchRequest: BecknRequest = {
    context,
    message: { intent } as any,
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: searchRequest,
  });

  // Persist logistics order record before sending search
  await db.insert(logisticsOrders).values({
    retail_order_id: params.retailOrderId,
    logistics_transaction_id: context.transaction_id,
    pickup_address: params.pickupAddress,
    delivery_address: params.deliveryAddress,
    package_weight: params.packageWeight?.toString() ?? "1",
    package_dimensions: params.packageDimensions ?? null,
    state: LogisticsOrderState.SEARCHING,
  });

  const searchTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    const { statusCode } = await httpRequest(`${config.gatewayUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...searchTraceHeaders,
      },
      body: JSON.stringify(searchRequest),
    });

    if (statusCode >= 200 && statusCode < 300) {
      logger.info(
        { transactionId: context.transaction_id, retailOrderId: params.retailOrderId },
        "Logistics search sent",
      );
    } else {
      logger.warn(
        { statusCode, transactionId: context.transaction_id },
        "Logistics search non-2xx",
      );
    }
  } catch (err) {
    logger.error({ err, transactionId: context.transaction_id }, "Failed to send logistics search");
  }

  return context.transaction_id;
}

/**
 * Select a logistics provider after receiving on_search quotes.
 *
 * Sends a select request to the chosen LSP's BPP URI.
 */
export async function selectLogistics(
  config: LogisticsConfig,
  db: Database,
  params: {
    transactionId: string;
    lspBppId: string;
    lspBppUri: string;
    providerId: string;
    items: Array<Record<string, unknown>>;
    fulfillment: Record<string, unknown>;
  },
  traceContext?: TraceContext,
): Promise<void> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "select",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: params.lspBppId,
    bpp_uri: params.lspBppUri,
    transaction_id: params.transactionId,
  });

  const selectRequest: BecknRequest = {
    context,
    message: {
      order: {
        provider: { id: params.providerId },
        items: params.items,
        fulfillments: [params.fulfillment],
      },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: selectRequest,
  });

  await db
    .update(logisticsOrders)
    .set({
      lsp_subscriber_id: params.lspBppId,
      lsp_provider_id: params.providerId,
      state: LogisticsOrderState.SELECTED,
      updated_at: new Date(),
    })
    .where(eq(logisticsOrders.logistics_transaction_id, params.transactionId));

  const selectTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    await httpRequest(`${params.lspBppUri}/select`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...selectTraceHeaders,
      },
      body: JSON.stringify(selectRequest),
    });
    logger.info(
      { transactionId: params.transactionId, providerId: params.providerId },
      "Logistics select sent",
    );
  } catch (err) {
    logger.error({ err, transactionId: params.transactionId }, "Failed to send logistics select");
  }
}

/**
 * Initialize logistics order with selected LSP.
 */
export async function initLogistics(
  config: LogisticsConfig,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  order: Record<string, unknown>,
  traceContext?: TraceContext,
): Promise<void> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "init",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: lspBppId,
    bpp_uri: lspBppUri,
    transaction_id: transactionId,
  });

  const initRequest: BecknRequest = {
    context,
    message: { order },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: initRequest,
  });

  const initTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    await httpRequest(`${lspBppUri}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...initTraceHeaders,
      },
      body: JSON.stringify(initRequest),
    });
    logger.info({ transactionId }, "Logistics init sent");
  } catch (err) {
    logger.error({ err, transactionId }, "Failed to send logistics init");
  }
}

/**
 * Confirm logistics booking with a specific LSP.
 */
export async function confirmLogistics(
  config: LogisticsConfig,
  db: Database,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  order: Record<string, unknown>,
  traceContext?: TraceContext,
): Promise<void> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "confirm",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: lspBppId,
    bpp_uri: lspBppUri,
    transaction_id: transactionId,
  });

  const confirmRequest: BecknRequest = {
    context,
    message: { order },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: confirmRequest,
  });

  await db
    .update(logisticsOrders)
    .set({
      state: LogisticsOrderState.CONFIRMED,
      updated_at: new Date(),
    })
    .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

  const confirmTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    await httpRequest(`${lspBppUri}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...confirmTraceHeaders,
      },
      body: JSON.stringify(confirmRequest),
    });
    logger.info({ transactionId, lspBppId }, "Logistics confirm sent");
  } catch (err) {
    logger.error({ err, transactionId }, "Failed to send logistics confirm");
  }
}

/**
 * Track logistics fulfillment status.
 */
export async function trackLogistics(
  config: LogisticsConfig,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  orderId: string,
  traceContext?: TraceContext,
): Promise<void> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "status",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: lspBppId,
    bpp_uri: lspBppUri,
    transaction_id: transactionId,
  });

  const statusRequest: BecknRequest = {
    context,
    message: {
      order: { id: orderId },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: statusRequest,
  });

  const statusTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    await httpRequest(`${lspBppUri}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...statusTraceHeaders,
      },
      body: JSON.stringify(statusRequest),
    });
    logger.info({ transactionId, orderId }, "Logistics status query sent");
  } catch (err) {
    logger.error({ err, transactionId }, "Failed to send logistics status");
  }
}

/**
 * Cancel logistics order with LSP.
 */
export async function cancelLogistics(
  config: LogisticsConfig,
  db: Database,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  orderId: string,
  reasonCode: string,
  traceContext?: TraceContext,
): Promise<void> {
  const context = buildContext({
    domain: "ONDC:LOG10",
    action: "cancel",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: lspBppId,
    bpp_uri: lspBppUri,
    transaction_id: transactionId,
  });

  // cancellation is an ONDC extension field not in the base Order type
  const cancelRequest: BecknRequest = {
    context,
    message: {
      order: {
        id: orderId,
        tags: [{ code: "cancellation_reason", list: [{ code: "reason_code", value: reasonCode }] }],
      },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: cancelRequest,
  });

  await db
    .update(logisticsOrders)
    .set({
      state: LogisticsOrderState.CANCELLED,
      updated_at: new Date(),
    })
    .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

  const cancelTraceHeaders = traceContext
    ? buildTraceHeadersFromContext(traceContext.traceId, traceContext.spanId)
    : {};

  try {
    await httpRequest(`${lspBppUri}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...cancelTraceHeaders,
      },
      body: JSON.stringify(cancelRequest),
    });
    logger.info({ transactionId, orderId }, "Logistics cancel sent");
  } catch (err) {
    logger.error({ err, transactionId }, "Failed to send logistics cancel");
  }
}

/**
 * Check if a fulfillment state is a terminal state.
 */
export function isTerminalLogisticsState(state: string): boolean {
  return [
    LogisticsFulfillmentState.DELIVERED,
    LogisticsFulfillmentState.CANCELLED,
    LogisticsFulfillmentState.RETURNED,
  ].includes(state as LogisticsFulfillmentState);
}
