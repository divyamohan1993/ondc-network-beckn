import { request as httpRequest } from "undici";
import { buildAuthHeader, buildContext, createLogger } from "@ondc/shared";
import type { BecknRequest, SearchIntent, Fulfillment } from "@ondc/shared";

const logger = createLogger("bpp-logistics");

export interface LogisticsConfig {
  /** Gateway URL for logistics search */
  gatewayUrl: string;
  /** BPP subscriber ID */
  bppId: string;
  /** BPP subscriber URI */
  bppUri: string;
  /** BPP private key for signing */
  privateKey: string;
  /** BPP unique key ID */
  uniqueKeyId: string;
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
 * Search for logistics service providers on the ONDC network.
 *
 * Sends an async search request to the ONDC logistics gateway. The gateway
 * will broadcast to all registered LSPs and relay their on_search callbacks
 * back to the BPP's URI.
 *
 * @param config - BPP logistics configuration
 * @param pickup - Pickup location (GPS, address)
 * @param drop - Drop location (GPS, address)
 * @param category - Delivery type: "Immediate Delivery", "Same Day Delivery", "Next Day Delivery", "Standard Delivery"
 * @param domain - Logistics domain (default: ONDC:LOG10)
 * @returns The transaction_id that can be used to correlate on_search callbacks.
 */
export async function searchLogistics(
  config: LogisticsConfig,
  pickup: { gps: string; address?: Record<string, string> },
  drop: { gps: string; address?: Record<string, string> },
  category: string = "Standard Delivery",
  domain: string = "ONDC:LOG10",
): Promise<string> {
  const context = buildContext({
    domain,
    action: "search",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    city: "std:080",
  });

  const searchRequest: BecknRequest = {
    context,
    message: {
      intent: {
        fulfillment: {
          type: "Delivery",
          start: { location: { gps: pickup.gps, address: pickup.address } },
          end: { location: { gps: drop.gps, address: drop.address } },
        },
        category: { descriptor: { name: category } },
      },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: searchRequest,
  });

  try {
    const { statusCode } = await httpRequest(`${config.gatewayUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(searchRequest),
    });

    if (statusCode >= 200 && statusCode < 300) {
      logger.info({ transactionId: context.transaction_id, domain }, "Logistics search sent");
    } else {
      logger.warn({ statusCode, transactionId: context.transaction_id }, "Logistics search non-2xx");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send logistics search");
  }

  return context.transaction_id;
}

/**
 * Confirm logistics booking with a specific LSP.
 *
 * After selecting an LSP from the on_search callbacks, the BPP sends a
 * confirm request to the LSP's BPP URI to finalize the delivery booking.
 *
 * @param config - BPP logistics configuration
 * @param lspBppUri - The LSP's BPP URI (from on_search)
 * @param lspBppId - The LSP's BPP subscriber ID (from on_search)
 * @param transactionId - The transaction_id from the original search
 * @param fulfillment - The fulfillment details for the delivery
 * @param domain - Logistics domain (default: ONDC:LOG10)
 */
export async function confirmLogistics(
  config: LogisticsConfig,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  fulfillment: Fulfillment,
  domain: string = "ONDC:LOG10",
): Promise<void> {
  const context = buildContext({
    domain,
    action: "confirm",
    bap_id: config.bppId,
    bap_uri: config.bppUri,
    bpp_id: lspBppId,
    bpp_uri: lspBppUri,
    transaction_id: transactionId,
  });

  const confirmRequest: BecknRequest = {
    context,
    message: {
      order: {
        fulfillments: [fulfillment],
      },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: config.bppId,
    uniqueKeyId: config.uniqueKeyId,
    privateKey: config.privateKey,
    body: confirmRequest,
  });

  try {
    await httpRequest(`${lspBppUri}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
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
 *
 * Sends a status request to the LSP to get the current fulfillment state.
 * The LSP responds asynchronously via the on_status callback.
 *
 * @param config - BPP logistics configuration
 * @param lspBppUri - The LSP's BPP URI
 * @param lspBppId - The LSP's BPP subscriber ID
 * @param transactionId - The transaction_id from the original search
 * @param orderId - The logistics order ID
 * @param domain - Logistics domain (default: ONDC:LOG10)
 */
export async function trackLogistics(
  config: LogisticsConfig,
  lspBppUri: string,
  lspBppId: string,
  transactionId: string,
  orderId: string,
  domain: string = "ONDC:LOG10",
): Promise<void> {
  const context = buildContext({
    domain,
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

  try {
    await httpRequest(`${lspBppUri}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(statusRequest),
    });
    logger.info({ transactionId, orderId }, "Logistics status query sent");
  } catch (err) {
    logger.error({ err, transactionId }, "Failed to send logistics status");
  }
}

/**
 * Check if a fulfillment state is a terminal state.
 *
 * Terminal states are final states where no further transitions are expected:
 * Delivered, Cancelled, or Returned.
 *
 * @param state - The fulfillment state string to check.
 * @returns `true` if the state is terminal.
 */
export function isTerminalLogisticsState(state: string): boolean {
  return [
    LogisticsFulfillmentState.DELIVERED,
    LogisticsFulfillmentState.CANCELLED,
    LogisticsFulfillmentState.RETURNED,
  ].includes(state as LogisticsFulfillmentState);
}
