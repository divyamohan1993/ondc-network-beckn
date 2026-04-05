import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import {
  createVerifyAuthMiddleware,
  createLogger,
  logisticsOrders,
  fulfillments,
  orders,
  subscribers,
  ack,
  nack,
  BecknCallbackAction,
  buildContext,
  buildAuthHeader,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { request as httpRequest } from "undici";
import {
  LogisticsOrderState,
  selectLogistics,
  initLogistics,
  confirmLogistics,
} from "../../services/logistics-client.js";
import type { LogisticsConfig } from "../../services/logistics-client.js";
import { updateFulfillmentState } from "../../services/fulfillment-manager.js";

type LogisticsSelectionStrategy = "cheapest" | "fastest" | "manual";

const LOGISTICS_SELECTION_STRATEGY: LogisticsSelectionStrategy =
  (process.env["LOGISTICS_SELECTION_STRATEGY"] as LogisticsSelectionStrategy) ?? "cheapest";

const logger = createLogger("bpp-logistics-callbacks");

/**
 * Map logistics fulfillment states from LSP to retail fulfillment states.
 */
function mapLogisticsToRetailState(logisticsState: string): string | null {
  const mapping: Record<string, string> = {
    "Searching-for-Agent": "Pending",
    "Agent-Assigned": "Agent-assigned",
    "At-pickup-location": "Agent-assigned",
    "Order-picked-up": "Order-picked-up",
    "En-route-to-drop": "In-transit",
    "At-drop-location": "Out-for-delivery",
    "Delivered-package": "Order-delivered",
    "Cancelled-package": "Cancelled",
    "Returned-package": "RTO-Delivered",
  };
  return mapping[logisticsState] ?? null;
}

/**
 * Build LogisticsConfig from the Fastify instance config.
 */
function buildLogisticsConfig(fastify: FastifyInstance): LogisticsConfig {
  const gatewayUrl =
    process.env["LOGISTICS_GATEWAY_URL"] ??
    process.env["GATEWAY_URL"] ??
    "http://localhost:3002";
  return {
    gatewayUrl,
    bppId: fastify.config.bppId,
    bppUri: fastify.config.bppUri,
    privateKey: fastify.config.privateKey,
    uniqueKeyId: fastify.config.uniqueKeyId,
  };
}

/**
 * Pick the best quote from LSP providers based on the configured strategy.
 * Returns null if no valid quotes found.
 */
function pickBestQuote(
  providers: any[],
  strategy: LogisticsSelectionStrategy,
): { providerId: string; items: any[]; fulfillment: any; price: number; tat: string | null } | null {
  let best: { providerId: string; items: any[]; fulfillment: any; price: number; tat: string | null } | null = null;

  for (const provider of providers) {
    const providerId = provider.id;
    const items = provider.items ?? [];
    const providerFulfillments = provider.fulfillments ?? [];

    for (const item of items) {
      const priceValue = parseFloat(item.price?.value ?? "Infinity");
      const tat = item.time?.duration ?? item["@ondc/org/time_to_ship"] ?? null;
      const fulfillment = providerFulfillments[0] ?? { type: "Delivery" };

      if (!best) {
        best = { providerId, items: [item], fulfillment, price: priceValue, tat };
        continue;
      }

      if (strategy === "cheapest" && priceValue < best.price) {
        best = { providerId, items: [item], fulfillment, price: priceValue, tat };
      } else if (strategy === "fastest" && tat && best.tat && tat < best.tat) {
        best = { providerId, items: [item], fulfillment, price: priceValue, tat };
      }
    }
  }

  return best;
}

/**
 * Send an on_status callback to the BAP for a retail order to communicate
 * logistics tracking info.
 */
async function sendRetailStatusUpdate(
  fastify: FastifyInstance,
  retailOrderId: string,
  fulfillmentState: string,
  trackingInfo: { awb_number?: string; tracking_url?: string },
): Promise<void> {
  const [order] = await fastify.db
    .select()
    .from(orders)
    .where(eq(orders.order_id, retailOrderId))
    .limit(1);

  if (!order) {
    logger.warn({ retailOrderId }, "Retail order not found for status update");
    return;
  }

  // Look up BAP URI from the subscribers table using bap_id
  const [subscriber] = await fastify.db
    .select()
    .from(subscribers)
    .where(eq(subscribers.subscriber_id, order.bap_id))
    .limit(1);

  const bapUri = subscriber?.subscriber_url ?? "";
  if (!bapUri) {
    logger.warn({ retailOrderId, bapId: order.bap_id }, "BAP URI not found in subscribers table");
    return;
  }

  await sendStatusToBAP(fastify, {
    orderId: retailOrderId,
    bapId: order.bap_id,
    bapUri,
    transactionId: order.transaction_id,
    domain: order.domain,
    city: order.city,
    fulfillmentState,
    trackingInfo,
  });
}

async function sendStatusToBAP(
  fastify: FastifyInstance,
  params: {
    orderId: string;
    bapId: string;
    bapUri: string;
    transactionId: string;
    domain: string;
    city: string;
    fulfillmentState: string;
    trackingInfo: { awb_number?: string; tracking_url?: string };
  },
): Promise<void> {
  if (!params.bapUri) return;

  const callbackContext = buildContext({
    domain: params.domain,
    city: params.city,
    action: BecknCallbackAction.on_status,
    bap_id: params.bapId,
    bap_uri: params.bapUri,
    bpp_id: fastify.config.bppId,
    bpp_uri: fastify.config.bppUri,
    transaction_id: params.transactionId,
  });

  const tags: any[] = [];
  if (params.trackingInfo.awb_number) {
    tags.push({ code: "awb_no", list: [{ code: "awb_no", value: params.trackingInfo.awb_number }] });
  }
  if (params.trackingInfo.tracking_url) {
    tags.push({ code: "tracking", list: [{ code: "url", value: params.trackingInfo.tracking_url }] });
  }

  const statusBody: BecknRequest = {
    context: callbackContext,
    message: {
      order: {
        id: params.orderId,
        state: params.fulfillmentState === "Order-delivered" ? "Completed" : "In-progress",
        fulfillments: [
          {
            state: {
              descriptor: { code: params.fulfillmentState, name: params.fulfillmentState },
            },
            tracking: !!params.trackingInfo.tracking_url,
            ...(tags.length > 0 ? { tags } : {}),
          },
        ],
      },
    },
  };

  const authHeader = buildAuthHeader({
    subscriberId: fastify.config.bppId,
    uniqueKeyId: fastify.config.uniqueKeyId,
    privateKey: fastify.config.privateKey,
    body: statusBody,
  });

  const url = `${params.bapUri.replace(/\/+$/, "")}/${BecknCallbackAction.on_status}`;

  try {
    await httpRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(statusBody),
    });
    logger.info({ orderId: params.orderId, url }, "Sent on_status to BAP with logistics info");
  } catch (err) {
    logger.error({ err, url }, "Failed to send on_status to BAP");
  }
}

/**
 * Logistics callback routes.
 *
 * The BPP acts as a BAP in the logistics domain, so it receives callbacks
 * (on_search, on_select, on_init, on_confirm, on_status, on_track, on_update,
 * on_cancel) from LSPs. These routes:
 *
 * 1. Verify the LSP's auth header
 * 2. Process the logistics response
 * 3. Update the logistics_orders table
 * 4. Update fulfillment state on the retail order when applicable
 */
export const registerLogisticsRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // -----------------------------------------------------------------------
  // on_search: LSP responds with available logistics services and quotes
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_search",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const body = request.body;
      const { context, message } = body;
      const transactionId = context.transaction_id;

      try {
        const providers = (message.catalog as any)?.["bpp/providers"] ?? [];

        if (providers.length > 0) {
          await fastify.db
            .update(logisticsOrders)
            .set({
              state: LogisticsOrderState.QUOTES_RECEIVED,
              updated_at: new Date(),
            })
            .where(eq(logisticsOrders.logistics_transaction_id, transactionId));
        }

        logger.info(
          { transactionId, providerCount: providers.length },
          "Logistics on_search received",
        );

        // Store quotes in Redis for retrieval by provider API / manual selection
        if (providers.length > 0) {
          await fastify.redis.setex(
            `logistics:quotes:${transactionId}`,
            3600,
            JSON.stringify({
              bpp_id: context.bpp_id,
              bpp_uri: context.bpp_uri,
              providers,
            }),
          );

          // Auto-select the best quote unless strategy is manual
          if (LOGISTICS_SELECTION_STRATEGY !== "manual") {
            const best = pickBestQuote(providers, LOGISTICS_SELECTION_STRATEGY);
            if (best) {
              const logisticsConfig = buildLogisticsConfig(fastify);
              selectLogistics(logisticsConfig, fastify.db, {
                transactionId,
                lspBppId: context.bpp_id ?? "",
                lspBppUri: context.bpp_uri ?? "",
                providerId: best.providerId,
                items: best.items,
                fulfillment: best.fulfillment,
              }).catch((err) => {
                logger.error(
                  { err, transactionId, providerId: best.providerId },
                  "Auto-select logistics failed",
                );
              });

              logger.info(
                { transactionId, strategy: LOGISTICS_SELECTION_STRATEGY, providerId: best.providerId, price: best.price },
                "Auto-selected logistics provider",
              );
            } else {
              logger.warn({ transactionId }, "No valid quotes found for auto-selection");
            }
          }
        }

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_search");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_search."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_select: LSP responds with selected service details and final quote
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_select",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        const quote = (message.order as any)?.quote;
        const selectOrder = message.order as any;

        if (quote) {
          await fastify.redis.setex(
            `logistics:select_quote:${transactionId}`,
            3600,
            JSON.stringify({
              bpp_id: context.bpp_id,
              bpp_uri: context.bpp_uri,
              quote,
              order: selectOrder,
            }),
          );
        }

        // Update state to SELECTED
        await fastify.db
          .update(logisticsOrders)
          .set({
            state: LogisticsOrderState.SELECTED,
            updated_at: new Date(),
          })
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        // Auto-init: retrieve retail order details and send init to LSP
        if (LOGISTICS_SELECTION_STRATEGY !== "manual" && selectOrder) {
          const logisticsConfig = buildLogisticsConfig(fastify);

          // Enrich the order with billing/payment from the retail order
          const [logOrder] = await fastify.db
            .select()
            .from(logisticsOrders)
            .where(eq(logisticsOrders.logistics_transaction_id, transactionId))
            .limit(1);

          let initOrder = selectOrder;
          if (logOrder) {
            const [retailOrder] = await fastify.db
              .select()
              .from(orders)
              .where(eq(orders.order_id, logOrder.retail_order_id))
              .limit(1);

            if (retailOrder) {
              initOrder = {
                ...selectOrder,
                billing: selectOrder.billing ?? retailOrder.billing,
                payment: selectOrder.payment ?? { type: "POST-FULFILLMENT", collected_by: "BAP" },
              };
            }
          }

          initLogistics(
            logisticsConfig,
            context.bpp_uri ?? "",
            context.bpp_id ?? "",
            transactionId,
            initOrder,
          ).catch((err) => {
            logger.error({ err, transactionId }, "Auto-init logistics failed");
          });

          logger.info({ transactionId }, "Auto-init logistics triggered");
        }

        logger.info({ transactionId }, "Logistics on_select received");
        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_select");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_select."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_init: LSP responds with initialized order details
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_init",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        await fastify.db
          .update(logisticsOrders)
          .set({
            state: LogisticsOrderState.INITIALIZED,
            updated_at: new Date(),
          })
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        const initOrder = message.order as any;

        if (initOrder) {
          await fastify.redis.setex(
            `logistics:init_order:${transactionId}`,
            3600,
            JSON.stringify({
              bpp_id: context.bpp_id,
              bpp_uri: context.bpp_uri,
              order: initOrder,
            }),
          );
        }

        // Auto-confirm: send confirm to LSP with the initialized order
        if (LOGISTICS_SELECTION_STRATEGY !== "manual" && initOrder) {
          const logisticsConfig = buildLogisticsConfig(fastify);

          // Build a confirmed order payload from the init response
          const confirmOrder = {
            ...initOrder,
            payment: initOrder.payment ?? { type: "POST-FULFILLMENT", collected_by: "BAP", status: "NOT-PAID" },
          };

          confirmLogistics(
            logisticsConfig,
            fastify.db,
            context.bpp_uri ?? "",
            context.bpp_id ?? "",
            transactionId,
            confirmOrder,
          ).catch((err) => {
            logger.error({ err, transactionId }, "Auto-confirm logistics failed");
          });

          logger.info({ transactionId }, "Auto-confirm logistics triggered");
        }

        logger.info({ transactionId }, "Logistics on_init received");
        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_init");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_init."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_confirm: LSP confirms the logistics order
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_confirm",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        const order = message.order as any;
        const lspOrderId = order?.id;
        const awbNumber = order?.fulfillments?.[0]?.tags?.find(
          (t: any) => t.code === "awb_no",
        )?.list?.[0]?.value;
        const trackingUrl = order?.fulfillments?.[0]?.tracking_url
          ?? order?.fulfillments?.[0]?.start?.instructions?.short_desc;
        const shippingLabel = order?.fulfillments?.[0]?.tags?.find(
          (t: any) => t.code === "shipping_label",
        )?.list?.[0]?.value;
        const estimatedPickup = order?.fulfillments?.[0]?.start?.time?.range?.start;
        const estimatedDelivery = order?.fulfillments?.[0]?.end?.time?.range?.end;

        await fastify.db
          .update(logisticsOrders)
          .set({
            state: LogisticsOrderState.CONFIRMED,
            lsp_order_id: lspOrderId ?? null,
            lsp_subscriber_id: context.bpp_id ?? null,
            awb_number: awbNumber ?? null,
            tracking_url: trackingUrl ?? null,
            shipping_label_url: shippingLabel ?? null,
            estimated_pickup: estimatedPickup ? new Date(estimatedPickup) : null,
            estimated_delivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
            updated_at: new Date(),
          })
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        // Map logistics confirmation to retail fulfillment state
        const [logOrder] = await fastify.db
          .select()
          .from(logisticsOrders)
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId))
          .limit(1);

        if (logOrder) {
          const orderFulfillments = await fastify.db
            .select()
            .from(fulfillments)
            .where(eq(fulfillments.order_id, logOrder.retail_order_id))
            .limit(1);

          if (orderFulfillments.length > 0) {
            const f = orderFulfillments[0];
            try {
              await updateFulfillmentState(
                fastify.db,
                logOrder.retail_order_id,
                f.fulfillment_id,
                "Packed",
                "logistics-confirm",
                {
                  tracking_url: trackingUrl ?? undefined,
                },
              );
            } catch (stateErr) {
              logger.warn(
                { err: stateErr, retailOrderId: logOrder.retail_order_id },
                "Could not update retail fulfillment on logistics confirm",
              );
            }
          }

          // Notify BAP with logistics tracking info
          sendRetailStatusUpdate(fastify, logOrder.retail_order_id, "Packed", {
            awb_number: awbNumber ?? undefined,
            tracking_url: trackingUrl ?? undefined,
          }).catch((err) => {
            logger.error(
              { err, retailOrderId: logOrder.retail_order_id },
              "Failed to send retail status update on logistics confirm",
            );
          });
        }

        logger.info(
          { transactionId, lspOrderId, awbNumber },
          "Logistics on_confirm received",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_confirm");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_confirm."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_status: LSP reports fulfillment status update
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_status",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        const order = message.order as any;
        const logisticsFulfillment = order?.fulfillments?.[0];
        const logisticsState = logisticsFulfillment?.state?.descriptor?.code
          ?? logisticsFulfillment?.state?.descriptor?.name;
        const trackingUrl = logisticsFulfillment?.tracking_url;
        const agentName = logisticsFulfillment?.agent?.name;
        const agentPhone = logisticsFulfillment?.agent?.phone;

        // Update logistics order
        const updateData: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (trackingUrl) updateData.tracking_url = trackingUrl;

        if (logisticsState === "Delivered-package") {
          updateData.state = LogisticsOrderState.COMPLETED;
          updateData.actual_delivery = new Date();
        } else if (logisticsState === "Cancelled-package") {
          updateData.state = LogisticsOrderState.CANCELLED;
        } else if (logisticsState) {
          updateData.state = LogisticsOrderState.IN_PROGRESS;
        }

        if (logisticsState === "Order-picked-up" || logisticsState === "At-pickup-location") {
          updateData.actual_pickup = new Date();
        }

        await fastify.db
          .update(logisticsOrders)
          .set(updateData as any)
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        // Map logistics state to retail fulfillment state and update retail order
        if (logisticsState) {
          const retailState = mapLogisticsToRetailState(logisticsState);

          if (retailState) {
            // Find the logistics order to get the retail order ID
            const [logOrder] = await fastify.db
              .select()
              .from(logisticsOrders)
              .where(eq(logisticsOrders.logistics_transaction_id, transactionId))
              .limit(1);

            if (logOrder) {
              // Get fulfillments for this retail order
              const orderFulfillments = await fastify.db
                .select()
                .from(fulfillments)
                .where(eq(fulfillments.order_id, logOrder.retail_order_id))
                .limit(1);

              if (orderFulfillments.length > 0) {
                const f = orderFulfillments[0];
                try {
                  await updateFulfillmentState(
                    fastify.db,
                    logOrder.retail_order_id,
                    f.fulfillment_id,
                    retailState,
                    "logistics-callback",
                    {
                      agent_name: agentName,
                      agent_phone: agentPhone,
                      tracking_url: trackingUrl,
                      actual_delivery: logisticsState === "Delivered-package" ? new Date() : undefined,
                    },
                  );
                } catch (stateErr) {
                  // Transition may be invalid if states are out of sync; log and continue
                  logger.warn(
                    { err: stateErr, retailOrderId: logOrder.retail_order_id, retailState },
                    "Could not update retail fulfillment state from logistics callback",
                  );
                }
              }
            }
          }
        }

        logger.info(
          { transactionId, logisticsState },
          "Logistics on_status received",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_status");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_status."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_track: LSP responds with tracking info
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_track",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        const trackingUrl = (message as any).tracking?.url
          ?? (message as any).tracking?.status;

        if (trackingUrl) {
          await fastify.db
            .update(logisticsOrders)
            .set({
              tracking_url: trackingUrl,
              updated_at: new Date(),
            })
            .where(eq(logisticsOrders.logistics_transaction_id, transactionId));
        }

        logger.info({ transactionId, trackingUrl }, "Logistics on_track received");
        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_track");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_track."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_update: LSP sends order update (rescheduling, weight changes, etc.)
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_update",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context, message } = request.body;
      const transactionId = context.transaction_id;

      try {
        const order = message.order as any;
        const updateData: Record<string, unknown> = {
          updated_at: new Date(),
        };

        const estimatedDelivery = order?.fulfillments?.[0]?.end?.time?.range?.end;
        if (estimatedDelivery) {
          updateData.estimated_delivery = new Date(estimatedDelivery);
        }

        const estimatedPickup = order?.fulfillments?.[0]?.start?.time?.range?.start;
        if (estimatedPickup) {
          updateData.estimated_pickup = new Date(estimatedPickup);
        }

        await fastify.db
          .update(logisticsOrders)
          .set(updateData as any)
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        logger.info({ transactionId }, "Logistics on_update received");
        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_update");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_update."),
        );
      }
    },
  );

  // -----------------------------------------------------------------------
  // on_cancel: LSP confirms cancellation
  // -----------------------------------------------------------------------
  fastify.post<{ Body: BecknRequest }>(
    "/logistics/on_cancel",
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { context } = request.body;
      const transactionId = context.transaction_id;

      try {
        await fastify.db
          .update(logisticsOrders)
          .set({
            state: LogisticsOrderState.CANCELLED,
            updated_at: new Date(),
          })
          .where(eq(logisticsOrders.logistics_transaction_id, transactionId));

        logger.info({ transactionId }, "Logistics on_cancel received");
        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, transactionId }, "Error processing logistics on_cancel");
        return reply.code(500).send(
          nack("DOMAIN-ERROR", "31001", "Internal error processing logistics on_cancel."),
        );
      }
    },
  );
};
