import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknCallbackAction,
  buildContext,
  buildAuthHeader,
  nack,
  transactions,
  logisticsOrders,
  createLogger,
  validateCatalogItems,
} from "@ondc/shared";
import type { BecknRequest, Item, Provider } from "@ondc/shared";
import { eq, desc } from "drizzle-orm";
import { request as httpRequest } from "undici";
import {
  storeCatalog,
  getCatalog,
  updateItem,
} from "../services/catalog.js";
import type { StoredCatalog } from "../services/catalog.js";
import { registerWebhook } from "../services/webhook.js";
import {
  selectLogistics,
  LogisticsOrderState,
} from "../services/logistics-client.js";
import type { LogisticsConfig } from "../services/logistics-client.js";
import { InventoryService } from "../services/inventory-service.js";

const logger = createLogger("bpp-provider-api");

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface CatalogBody {
  provider: Provider;
  items: Item[];
}

interface UpdateItemBody {
  price?: Item["price"];
  quantity?: Item["quantity"];
  descriptor?: Item["descriptor"];
  active?: boolean;
  tags?: Item["tags"];
}

interface FulfillBody {
  status: string;
  tracking?: {
    url?: string;
    status?: string;
  };
  bap_id: string;
  bap_uri: string;
  transaction_id: string;
  domain?: string;
  city?: string;
}

interface WebhookBody {
  url: string;
  events: string[];
}

interface InventorySetBody {
  items: Array<{
    item_id: string;
    stock_quantity: number;
    sku?: string;
    low_stock_threshold?: number;
    max_quantity_per_order?: number;
  }>;
  provider_id?: string;
}

interface InventoryUpdateBody {
  stock_quantity?: number;
  sku?: string;
  low_stock_threshold?: number;
  max_quantity_per_order?: number;
  provider_id?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Simplified REST API for seller applications.
 *
 * Provides an easier interface for managing catalog, processing orders,
 * and sending fulfillment updates.
 */
export const registerProviderApi: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // -------------------------------------------------------------------------
  // POST /api/catalog
  // -------------------------------------------------------------------------
  fastify.post<{ Body: CatalogBody }>("/catalog", async (request, reply) => {
    const { provider, items } = request.body;

    if (!provider || !items || !Array.isArray(items)) {
      return reply.code(400).send({
        error: "provider and items[] are required.",
      });
    }

    try {
      // Validate catalog against ONDC domain-specific rules
      const domain = (request.query as Record<string, string>)?.domain;
      let validationResult = null;
      if (domain) {
        validationResult = validateCatalogItems(
          domain,
          provider as unknown as Record<string, unknown>,
          items as unknown as Record<string, unknown>[],
        );
        if (!validationResult.valid) {
          logger.warn(
            { domain, errors: validationResult.errors },
            "Catalog validation failed",
          );
        }
      }

      const catalog: StoredCatalog = {
        provider,
        items,
        updatedAt: new Date().toISOString(),
      };

      await storeCatalog(fastify.config.bppId, catalog, fastify.redis);

      return reply.code(200).send({
        status: "stored",
        provider_id: provider.id,
        item_count: items.length,
        updated_at: catalog.updatedAt,
        validation: validationResult
          ? {
              valid: validationResult.valid,
              errors: validationResult.errors,
              warnings: validationResult.warnings,
            }
          : undefined,
      });
    } catch (err) {
      logger.error({ err }, "Error storing catalog");
      return reply.code(500).send({
        error: "Internal error storing catalog.",
      });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /api/catalog/items/:id
  // -------------------------------------------------------------------------
  fastify.put<{ Params: { id: string }; Body: UpdateItemBody }>(
    "/catalog/items/:id",
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;

      if (!id) {
        return reply.code(400).send({
          error: "Item ID is required.",
        });
      }

      try {
        const updated = await updateItem(
          fastify.config.bppId,
          id,
          updates as Partial<Item>,
          fastify.redis,
        );

        if (!updated) {
          return reply.code(404).send({
            error: "Item not found in catalog.",
            item_id: id,
          });
        }

        return reply.code(200).send({
          status: "updated",
          item_id: id,
        });
      } catch (err) {
        logger.error({ err, itemId: id }, "Error updating item");
        return reply.code(500).send({
          error: "Internal error updating item.",
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/catalog
  // -------------------------------------------------------------------------
  fastify.get("/catalog", async (_request, reply) => {
    try {
      const catalog = await getCatalog(fastify.config.bppId, fastify.redis);

      if (!catalog) {
        return reply.code(404).send({
          error: "No catalog found. Use POST /api/catalog to create one.",
        });
      }

      return reply.code(200).send(catalog);
    } catch (err) {
      logger.error({ err }, "Error retrieving catalog");
      return reply.code(500).send({
        error: "Internal error retrieving catalog.",
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/fulfill/:order_id
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { order_id: string }; Body: FulfillBody }>(
    "/fulfill/:order_id",
    async (request, reply) => {
      const { order_id } = request.params;
      const { status, tracking, bap_id, bap_uri, transaction_id, domain, city } =
        request.body;

      if (!order_id || !status || !bap_id || !bap_uri || !transaction_id) {
        return reply.code(400).send({
          error:
            "order_id, status, bap_id, bap_uri, and transaction_id are required.",
        });
      }

      try {
        // Send on_status callback to BAP
        const callbackContext = buildContext({
          domain: domain ?? "ONDC:RET10",
          city: city ?? "std:080",
          action: BecknCallbackAction.on_status,
          bap_id,
          bap_uri,
          bpp_id: fastify.config.bppId,
          bpp_uri: fastify.config.bppUri,
          transaction_id,
        });

        const statusBody: BecknRequest = {
          context: callbackContext,
          message: {
            order: {
              id: order_id,
              state: status,
              fulfillments: [
                {
                  state: {
                    descriptor: { code: status, name: status },
                  },
                  tracking: tracking?.url != null,
                  ...(tracking?.url
                    ? { tags: [{ code: "tracking", list: [{ code: "url", value: tracking.url }] }] }
                    : {}),
                },
              ],
            },
          },
        };

        // Sign and send
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bppId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body: statusBody,
        });

        // Log transaction
        await fastify.db.insert(transactions).values({
          transaction_id: callbackContext.transaction_id,
          message_id: callbackContext.message_id,
          action: BecknCallbackAction.on_status,
          bap_id: callbackContext.bap_id,
          bpp_id: callbackContext.bpp_id,
          domain: callbackContext.domain,
          city: callbackContext.city,
          request_body: statusBody,
          status: "SENT",
        });

        const url = `${bap_uri.replace(/\/+$/, "")}/${BecknCallbackAction.on_status}`;

        // Send asynchronously
        httpRequest(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(statusBody),
        })
          .then(async (response) => {
            const respText = await response.body.text();
            if (response.statusCode !== 200) {
              logger.warn(
                { url, statusCode: response.statusCode, response: respText },
                "BAP on_status callback returned non-200",
              );
            }
          })
          .catch((err) => {
            logger.error({ err, url }, "Failed to send on_status to BAP");
          });

        // If tracking info provided, also send on_track
        if (tracking?.url) {
          const trackContext = buildContext({
            domain: domain ?? "ONDC:RET10",
            city: city ?? "std:080",
            action: BecknCallbackAction.on_track,
            bap_id,
            bap_uri,
            bpp_id: fastify.config.bppId,
            bpp_uri: fastify.config.bppUri,
            transaction_id,
          });

          const trackBody: BecknRequest = {
            context: trackContext,
            message: {
              tracking: {
                url: tracking.url,
                status: tracking.status ?? "active",
              },
            },
          };

          const trackAuthHeader = buildAuthHeader({
            subscriberId: fastify.config.bppId,
            uniqueKeyId: fastify.config.uniqueKeyId,
            privateKey: fastify.config.privateKey,
            body: trackBody,
          });

          await fastify.db.insert(transactions).values({
            transaction_id: trackContext.transaction_id,
            message_id: trackContext.message_id,
            action: BecknCallbackAction.on_track,
            bap_id: trackContext.bap_id,
            bpp_id: trackContext.bpp_id,
            domain: trackContext.domain,
            city: trackContext.city,
            request_body: trackBody,
            status: "SENT",
          });

          const trackUrl = `${bap_uri.replace(/\/+$/, "")}/${BecknCallbackAction.on_track}`;

          httpRequest(trackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: trackAuthHeader,
            },
            body: JSON.stringify(trackBody),
          })
            .then(async (response) => {
              const respText = await response.body.text();
              if (response.statusCode !== 200) {
                logger.warn(
                  { url: trackUrl, statusCode: response.statusCode, response: respText },
                  "BAP on_track callback returned non-200",
                );
              }
            })
            .catch((err) => {
              logger.error({ err, url: trackUrl }, "Failed to send on_track to BAP");
            });
        }

        return reply.code(200).send({
          status: "fulfillment_sent",
          order_id,
          fulfillment_status: status,
          tracking: tracking ?? null,
        });
      } catch (err) {
        logger.error({ err, order_id }, "Error processing fulfillment");
        return reply.code(500).send({
          error: "Internal error processing fulfillment.",
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/orders
  // -------------------------------------------------------------------------
  fastify.get("/orders", async (_request, reply) => {
    try {
      // Retrieve incoming orders (actions like select, init, confirm sent to this BPP)
      const orderRecords = await fastify.db
        .select()
        .from(transactions)
        .where(eq(transactions.bpp_id, fastify.config.bppId))
        .orderBy(desc(transactions.created_at))
        .limit(100);

      // Group by transaction_id
      const ordersMap = new Map<
        string,
        {
          transaction_id: string;
          bap_id: string | null;
          domain: string | null;
          latest_action: string;
          latest_status: string | null;
          created_at: Date | null;
          actions: Array<{
            action: string;
            status: string | null;
            created_at: Date | null;
            message_id: string;
          }>;
        }
      >();

      for (const record of orderRecords) {
        const txnId = record.transaction_id;
        if (!ordersMap.has(txnId)) {
          ordersMap.set(txnId, {
            transaction_id: txnId,
            bap_id: record.bap_id,
            domain: record.domain,
            latest_action: record.action,
            latest_status: record.status,
            created_at: record.created_at,
            actions: [],
          });
        }

        const order = ordersMap.get(txnId)!;
        order.actions.push({
          action: record.action,
          status: record.status,
          created_at: record.created_at,
          message_id: record.message_id,
        });

        // Update latest if this record is more recent
        if (
          record.created_at &&
          order.created_at &&
          record.created_at > order.created_at
        ) {
          order.latest_action = record.action;
          order.latest_status = record.status;
        }
      }

      return reply.code(200).send({
        orders: Array.from(ordersMap.values()),
        total: ordersMap.size,
      });
    } catch (err) {
      logger.error({ err }, "Error listing orders");
      return reply.code(500).send({
        error: "Internal error listing orders.",
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/logistics/:orderId/select
  // Allows a seller to manually select a logistics provider from available quotes.
  // Used when LOGISTICS_SELECTION_STRATEGY is "manual".
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { orderId: string };
    Body: { provider_id: string; item_index?: number };
  }>("/logistics/:orderId/select", async (request, reply) => {
    const { orderId } = request.params;
    const { provider_id, item_index } = request.body;

    if (!orderId || !provider_id) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "orderId and provider_id are required.", details: [] },
      });
    }

    try {
      // Find the logistics order for this retail order
      const [logOrder] = await fastify.db
        .select()
        .from(logisticsOrders)
        .where(eq(logisticsOrders.retail_order_id, orderId))
        .limit(1);

      if (!logOrder) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "No logistics order found for this retail order.", details: [] },
        });
      }

      if (logOrder.state !== LogisticsOrderState.QUOTES_RECEIVED) {
        return reply.code(409).send({
          error: {
            code: "CONFLICT",
            message: `Logistics order is in state ${logOrder.state}, not QUOTES_RECEIVED. Cannot select.`,
            details: [],
          },
        });
      }

      // Retrieve cached quotes from Redis
      const quotesRaw = await fastify.redis.get(`logistics:quotes:${logOrder.logistics_transaction_id}`);
      if (!quotesRaw) {
        return reply.code(410).send({
          error: { code: "GONE", message: "Quotes have expired. Trigger a new logistics search.", details: [] },
        });
      }

      const quotesData = JSON.parse(quotesRaw);
      const providers: any[] = quotesData.providers ?? [];
      const selectedProvider = providers.find((p: any) => p.id === provider_id);

      if (!selectedProvider) {
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: `Provider ${provider_id} not found in available quotes.`,
            details: [{ available_providers: providers.map((p: any) => p.id) }],
          },
        });
      }

      const items = selectedProvider.items ?? [];
      const selectedItem = items[item_index ?? 0];
      if (!selectedItem) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "No items found for the selected provider.", details: [] },
        });
      }

      const providerFulfillments = selectedProvider.fulfillments ?? [];
      const fulfillment = providerFulfillments[0] ?? { type: "Delivery" };

      const logisticsConfig: LogisticsConfig = {
        gatewayUrl: process.env["LOGISTICS_GATEWAY_URL"] ?? process.env["GATEWAY_URL"] ?? "http://localhost:3002",
        bppId: fastify.config.bppId,
        bppUri: fastify.config.bppUri,
        privateKey: fastify.config.privateKey,
        uniqueKeyId: fastify.config.uniqueKeyId,
      };

      await selectLogistics(logisticsConfig, fastify.db, {
        transactionId: logOrder.logistics_transaction_id,
        lspBppId: quotesData.bpp_id ?? "",
        lspBppUri: quotesData.bpp_uri ?? "",
        providerId: provider_id,
        items: [selectedItem],
        fulfillment,
      });

      logger.info(
        { orderId, providerId: provider_id, transactionId: logOrder.logistics_transaction_id },
        "Manual logistics provider selected",
      );

      return reply.code(200).send({
        status: "selected",
        order_id: orderId,
        logistics_transaction_id: logOrder.logistics_transaction_id,
        provider_id,
        price: selectedItem.price?.value ?? null,
      });
    } catch (err) {
      logger.error({ err, orderId }, "Error in manual logistics selection");
      return reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message: "Internal error selecting logistics provider.", details: [] },
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/logistics/:orderId/quotes
  // Retrieve available logistics quotes for a retail order.
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { orderId: string } }>(
    "/logistics/:orderId/quotes",
    async (request, reply) => {
      const { orderId } = request.params;

      try {
        const [logOrder] = await fastify.db
          .select()
          .from(logisticsOrders)
          .where(eq(logisticsOrders.retail_order_id, orderId))
          .limit(1);

        if (!logOrder) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "No logistics order found for this retail order.", details: [] },
          });
        }

        const quotesRaw = await fastify.redis.get(`logistics:quotes:${logOrder.logistics_transaction_id}`);
        if (!quotesRaw) {
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "No quotes available. They may have expired.", details: [] },
          });
        }

        const quotesData = JSON.parse(quotesRaw);
        const providers = (quotesData.providers ?? []).map((p: any) => ({
          provider_id: p.id,
          name: p.descriptor?.name ?? p.id,
          items: (p.items ?? []).map((item: any, idx: number) => ({
            index: idx,
            name: item.descriptor?.name ?? item.id,
            price: item.price,
            time_to_ship: item.time?.duration ?? item["@ondc/org/time_to_ship"] ?? null,
          })),
        }));

        return reply.code(200).send({
          order_id: orderId,
          logistics_transaction_id: logOrder.logistics_transaction_id,
          state: logOrder.state,
          providers,
        });
      } catch (err) {
        logger.error({ err, orderId }, "Error retrieving logistics quotes");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal error retrieving logistics quotes.", details: [] },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/inventory — set stock for multiple items
  // -------------------------------------------------------------------------
  fastify.post<{ Body: InventorySetBody }>(
    "/inventory",
    async (request, reply) => {
      const { items, provider_id } = request.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "items[] is required and must not be empty.", details: [] },
        });
      }

      const providerId = provider_id ?? fastify.config.bppId;
      const inventoryService = new InventoryService(fastify.db);

      try {
        for (const item of items) {
          if (!item.item_id || item.stock_quantity == null) {
            return reply.code(400).send({
              error: { code: "BAD_REQUEST", message: "Each item requires item_id and stock_quantity.", details: [] },
            });
          }
          await inventoryService.setStock(providerId, item.item_id, item.stock_quantity, {
            sku: item.sku,
            lowStockThreshold: item.low_stock_threshold,
            maxQuantityPerOrder: item.max_quantity_per_order,
          });
        }

        return reply.code(200).send({
          status: "updated",
          provider_id: providerId,
          item_count: items.length,
        });
      } catch (err) {
        logger.error({ err }, "Error setting inventory");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal error setting inventory.", details: [] },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/inventory — get stock levels for a provider
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: { provider_id?: string } }>(
    "/inventory",
    async (request, reply) => {
      const providerId =
        (request.query as Record<string, string>).provider_id ??
        fastify.config.bppId;
      const inventoryService = new InventoryService(fastify.db);

      try {
        const stock = await inventoryService.getStock(providerId);

        return reply.code(200).send({
          provider_id: providerId,
          items: stock.map((s) => ({
            item_id: s.item_id,
            sku: s.sku,
            stock_quantity: s.stock_quantity,
            reserved_quantity: s.reserved_quantity,
            available_quantity: s.stock_quantity - s.reserved_quantity,
            low_stock_threshold: s.low_stock_threshold,
            max_quantity_per_order: s.max_quantity_per_order,
            track_inventory: s.track_inventory,
            updated_at: s.updated_at,
          })),
          total: stock.length,
        });
      } catch (err) {
        logger.error({ err }, "Error retrieving inventory");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal error retrieving inventory.", details: [] },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/inventory/low-stock — get items below threshold
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: { provider_id?: string } }>(
    "/inventory/low-stock",
    async (request, reply) => {
      const providerId =
        (request.query as Record<string, string>).provider_id ??
        fastify.config.bppId;
      const inventoryService = new InventoryService(fastify.db);

      try {
        const lowStock = await inventoryService.getLowStockItems(providerId);

        return reply.code(200).send({
          provider_id: providerId,
          items: lowStock.map((s) => ({
            item_id: s.item_id,
            sku: s.sku,
            stock_quantity: s.stock_quantity,
            reserved_quantity: s.reserved_quantity,
            available_quantity: s.stock_quantity - s.reserved_quantity,
            low_stock_threshold: s.low_stock_threshold,
            updated_at: s.updated_at,
          })),
          total: lowStock.length,
        });
      } catch (err) {
        logger.error({ err }, "Error retrieving low-stock items");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal error retrieving low-stock items.", details: [] },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PUT /api/inventory/:itemId — update stock for a single item
  // -------------------------------------------------------------------------
  fastify.put<{ Params: { itemId: string }; Body: InventoryUpdateBody }>(
    "/inventory/:itemId",
    async (request, reply) => {
      const { itemId } = request.params;
      const { stock_quantity, sku, low_stock_threshold, max_quantity_per_order, provider_id } =
        request.body;

      if (!itemId) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "itemId is required.", details: [] },
        });
      }

      if (stock_quantity == null) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "stock_quantity is required.", details: [] },
        });
      }

      const providerId = provider_id ?? fastify.config.bppId;
      const inventoryService = new InventoryService(fastify.db);

      try {
        await inventoryService.setStock(providerId, itemId, stock_quantity, {
          sku,
          lowStockThreshold: low_stock_threshold,
          maxQuantityPerOrder: max_quantity_per_order,
        });

        return reply.code(200).send({
          status: "updated",
          provider_id: providerId,
          item_id: itemId,
          stock_quantity,
        });
      } catch (err) {
        logger.error({ err, itemId }, "Error updating inventory item");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal error updating inventory.", details: [] },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/webhooks
  // -------------------------------------------------------------------------
  fastify.post<{ Body: WebhookBody }>("/webhooks", async (request, reply) => {
    const { url, events } = request.body;

    if (!url) {
      return reply.code(400).send({
        error: "url is required.",
      });
    }

    try {
      await registerWebhook(
        fastify.config.bppId,
        url,
        events ?? ["*"],
        fastify.redis,
      );

      return reply.code(200).send({
        status: "registered",
        subscriber_id: fastify.config.bppId,
        url,
        events: events ?? ["*"],
      });
    } catch (err) {
      logger.error({ err }, "Error registering webhook");
      return reply.code(500).send({
        error: "Internal error registering webhook.",
      });
    }
  });
};
