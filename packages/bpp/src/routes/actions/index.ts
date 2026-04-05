import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknAction,
  BecknCallbackAction,
  OrderState,
  validateBecknRequest,
  validateCatalogItems,
  buildContext,
  buildAuthHeader,
  ack,
  nack,
  transactions,
  createVerifyAuthMiddleware,
  createVerifyGatewayAuthMiddleware,
  createLogger,
  isNetworkCancellation,
  SettlementService,
  SettlementBasis,
  NocsTxnStatus,
  maskPiiInBody,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { request as httpRequest } from "undici";
import { buildOnSearchResponse } from "../../services/catalog.js";
import { notifyWebhook } from "../../services/webhook.js";
import { processOrderAction } from "../../services/order-manager.js";
import {
  createFulfillment,
  updateFulfillmentState,
  getFulfillmentsByOrderId,
} from "../../services/fulfillment-manager.js";
import {
  searchLogistics,
} from "../../services/logistics-client.js";
import type { LogisticsConfig, LogisticsSearchParams } from "../../services/logistics-client.js";

const logger = createLogger("bpp-actions");

/**
 * All 10 Beckn actions that the BPP receives from BAPs/Gateway.
 */
const BECKN_ACTIONS = Object.values(BecknAction);

/**
 * Map an action to its corresponding callback action.
 */
function getCallbackAction(action: string): BecknCallbackAction {
  return `on_${action}` as BecknCallbackAction;
}

/**
 * Send a signed callback (on_{action}) response back to the BAP.
 */
async function sendCallback(
  bapUri: string,
  callbackAction: string,
  body: object,
  privateKey: string,
  subscriberId: string,
  keyId: string,
): Promise<void> {
  const authHeader = buildAuthHeader({
    subscriberId,
    uniqueKeyId: keyId,
    privateKey,
    body,
  });

  const url = `${bapUri.replace(/\/+$/, "")}/${callbackAction}`;

  logger.info({ url, callbackAction }, "Sending callback to BAP");

  try {
    const { statusCode, body: responseBody } = await httpRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    const responseText = await responseBody.text();

    if (statusCode !== 200) {
      logger.warn(
        { url, statusCode, response: responseText },
        "BAP callback returned non-200 status",
      );
    } else {
      logger.info({ url, callbackAction, statusCode }, "Callback sent to BAP");
    }
  } catch (err) {
    logger.error({ err, url, callbackAction }, "Failed to send callback to BAP");
  }
}

/**
 * Register all 10 incoming Beckn action routes dynamically.
 *
 * Each route:
 *   POST /{action}
 *   - Verifies the Authorization header (and X-Gateway-Authorization for search)
 *   - Validates the Beckn request format
 *   - For search: looks up catalog and generates on_search response
 *   - For others: forwards to seller app webhook or processes internally
 *   - Logs the transaction in the database
 *   - Returns ACK
 *   - Asynchronously sends the callback (on_{action}) to the BAP
 */
export const registerActionRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Set up auth verification middleware for all action routes
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // Set up gateway auth verification for search requests (ONDC compliance)
  const verifyGatewayAuth = createVerifyGatewayAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  for (const action of BECKN_ACTIONS) {
    // Search requires both Authorization (BAP) and X-Gateway-Authorization (Gateway)
    const preHandlers = action === BecknAction.search
      ? [verifyAuth, verifyGatewayAuth]
      : [verifyAuth];

    fastify.post<{ Body: BecknRequest }>(
      `/${action}`,
      { preHandler: preHandlers },
      async (request, reply) => {
        // Validate
        const validation = validateBecknRequest(request.body);
        if (!validation.valid) {
          logger.warn(
            { action, errors: validation.errors },
            "Invalid Beckn request",
          );
          return reply.code(400).send(
            nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
          );
        }

        const body = request.body as BecknRequest;
        const { context } = body;

        try {
          // Log incoming transaction (PII encrypted at rest)
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action,
            bap_id: context.bap_id,
            bpp_id: fastify.config.bppId,
            domain: context.domain,
            city: context.city,
            request_body: maskPiiInBody(body, fastify.piiKey),
            status: "ACK",
          });

          // Process the action and send callback asynchronously
          const callbackAction = getCallbackAction(action);

          if (action === BecknAction.search) {
            // Handle search: build on_search from catalog
            handleSearchCallback(
              fastify,
              body,
              callbackAction,
            ).catch((err) => {
              logger.error(
                { err, action, transactionId: context.transaction_id },
                "Async search callback failed",
              );
            });
          } else {
            // For all other actions: notify seller webhook and send callback
            handleGenericCallback(
              fastify,
              body,
              action,
              callbackAction,
            ).catch((err) => {
              logger.error(
                { err, action, transactionId: context.transaction_id },
                "Async callback failed",
              );
            });
          }

          logger.info(
            { action, transactionId: context.transaction_id },
            "Action received and ACK sent",
          );

          return reply.code(200).send(ack());
        } catch (err) {
          logger.error({ err, action }, "Error processing action");
          return reply.code(500).send(
            nack("DOMAIN-ERROR", "31001", "Internal error processing action."),
          );
        }
      },
    );
  }

  /**
   * Handle the search action: build on_search from stored catalog and
   * send back to the BAP.
   */
  async function handleSearchCallback(
    server: FastifyInstance,
    incomingRequest: BecknRequest,
    callbackAction: string,
  ): Promise<void> {
    const { context, message } = incomingRequest;

    // Build on_search catalog
    const catalog = await buildOnSearchResponse(
      server.config.bppId,
      message.intent,
      server.redis,
      context.domain,
    );

    // Build callback context (reuse originating message_id per ONDC spec)
    const callbackContext = buildContext({
      domain: context.domain,
      city: context.city,
      action: callbackAction,
      bap_id: context.bap_id,
      bap_uri: context.bap_uri,
      bpp_id: server.config.bppId,
      bpp_uri: server.config.bppUri,
      transaction_id: context.transaction_id,
      message_id: context.message_id,
    });

    // Validate catalog items (non-blocking, log warnings)
    if (catalog && catalog["bpp/providers"]) {
      for (const provider of catalog["bpp/providers"]) {
        if (provider.items && provider.items.length > 0) {
          const validationResult = validateCatalogItems(
            context.domain,
            provider as unknown as Record<string, unknown>,
            provider.items as unknown as Record<string, unknown>[],
          );
          if (!validationResult.valid) {
            logger.warn(
              { errors: validationResult.errors, warnings: validationResult.warnings, domain: context.domain },
              "Catalog validation issues detected in on_search response",
            );
          } else if (validationResult.warnings.length > 0) {
            logger.warn(
              { warnings: validationResult.warnings, domain: context.domain },
              "Catalog validation warnings in on_search response",
            );
          }
        }
      }
    }

    const callbackBody: BecknRequest = {
      context: callbackContext,
      message: {
        catalog: catalog ?? {
          "bpp/descriptor": { name: "No catalog available" },
          "bpp/providers": [],
        },
      },
    };

    // Log callback transaction (PII encrypted at rest)
    await server.db.insert(transactions).values({
      transaction_id: callbackContext.transaction_id,
      message_id: callbackContext.message_id,
      action: callbackAction,
      bap_id: callbackContext.bap_id,
      bpp_id: callbackContext.bpp_id,
      domain: callbackContext.domain,
      city: callbackContext.city,
      request_body: maskPiiInBody(callbackBody, fastify.piiKey),
      status: "SENT",
    });

    // Send callback to BAP
    await sendCallback(
      context.bap_uri,
      callbackAction,
      callbackBody,
      server.config.privateKey,
      server.config.bppId,
      server.config.uniqueKeyId,
    );
  }

  /**
   * Handle all non-search actions: notify seller webhook (if registered),
   * then send callback to BAP.
   */
  async function handleGenericCallback(
    server: FastifyInstance,
    incomingRequest: BecknRequest,
    action: string,
    callbackAction: string,
  ): Promise<void> {
    const { context, message } = incomingRequest;

    // Notify seller app webhook (fire-and-forget)
    notifyWebhook(
      server.config.bppId,
      action,
      incomingRequest,
      server.redis,
    ).catch((err) => {
      logger.error(
        { err, action, transactionId: context.transaction_id },
        "Seller webhook notification failed",
      );
    });

    // Detect force/network cancellation
    const cancellationCode = (message.order as any)?.cancellation?.reason?.id
      ?? (message.order as any)?.tags?.find((t: any) => t.code === "cancellation_reason")?.list?.find((l: any) => l.code === "reason_code")?.value;
    const isForceCancellation = action === BecknAction.cancel && cancellationCode && isNetworkCancellation(cancellationCode);

    if (isForceCancellation) {
      logger.warn(
        { action, transactionId: context.transaction_id, cancellationCode, initiator: "network" },
        "Force/network-initiated cancellation received",
      );
    }

    // Persist order state
    const defaultState = isForceCancellation ? OrderState.Cancelled : getDefaultOrderState(action);
    let orderResult = { orderId: context.transaction_id, state: defaultState };
    try {
      orderResult = await processOrderAction(server.db, action, context, message);
      if (isForceCancellation) {
        orderResult.state = OrderState.Cancelled;
      }
    } catch (err) {
      logger.error({ err, action, transactionId: context.transaction_id }, "Order persistence failed");
    }

    // Fulfillment tracking
    try {
      if (action === BecknAction.confirm) {
        // Create fulfillment records for each fulfillment in the order
        const orderFulfillments = (message.order as any)?.fulfillments ?? [];
        for (const f of orderFulfillments) {
          const fId = f.id ?? `${orderResult.orderId}_f1`;
          await createFulfillment(server.db, orderResult.orderId, fId, {
            type: f.type ?? "Delivery",
            routing_type: f.routing_type ?? "P2P",
            provider_id: f.provider_id,
          });
        }
        // If no fulfillments specified, create a default one
        if (orderFulfillments.length === 0) {
          await createFulfillment(
            server.db,
            orderResult.orderId,
            `${orderResult.orderId}_f1`,
          );
        }

        // Initiate logistics search for P2H2P or when fulfillment uses an LSP
        const needsLogistics = orderFulfillments.some(
          (f: any) =>
            f.routing_type === "P2H2P" ||
            f["@ondc/org/provider_name"] ||
            f.tags?.some((t: any) => t.code === "routing" && t.list?.some((l: any) => l.code === "type" && l.value === "P2H2P")),
        );

        if (needsLogistics || process.env["LOGISTICS_ENABLED"] === "true") {
          const gatewayUrl = process.env["LOGISTICS_GATEWAY_URL"] ?? process.env["GATEWAY_URL"] ?? "http://localhost:3002";
          const logisticsConfig: LogisticsConfig = {
            gatewayUrl,
            bppId: server.config.bppId,
            bppUri: server.config.bppUri,
            privateKey: server.config.privateKey,
            uniqueKeyId: server.config.uniqueKeyId,
          };

          const pickup = (message.order as any)?.fulfillments?.[0]?.start?.location;
          const delivery = (message.order as any)?.fulfillments?.[0]?.end?.location;

          if (pickup?.gps && delivery?.gps) {
            const searchParams: LogisticsSearchParams = {
              retailOrderId: orderResult.orderId,
              pickupAddress: {
                gps: pickup.gps,
                area_code: pickup.address?.area_code,
                city: pickup.address?.city ?? context.city,
                state: pickup.address?.state,
                address: pickup.address?.name ?? pickup.address?.street,
              },
              deliveryAddress: {
                gps: delivery.gps,
                area_code: delivery.address?.area_code,
                city: delivery.address?.city,
                state: delivery.address?.state,
                address: delivery.address?.name ?? delivery.address?.street,
              },
              cityCode: context.city,
            };

            searchLogistics(logisticsConfig, server.db, searchParams).catch(
              (logErr) => {
                logger.error(
                  { err: logErr, orderId: orderResult.orderId },
                  "Logistics search initiation failed",
                );
              },
            );
          } else {
            logger.warn(
              { orderId: orderResult.orderId },
              "Logistics search skipped: missing pickup or delivery GPS",
            );
          }
        }
      } else if (action === BecknAction.update) {
        // Update fulfillment state if fulfillment state info is present
        const orderFulfillments = (message.order as any)?.fulfillments ?? [];
        for (const f of orderFulfillments) {
          const newState = f.state?.descriptor?.code ?? f.state?.descriptor?.name;
          if (f.id && newState) {
            await updateFulfillmentState(
              server.db,
              orderResult.orderId,
              f.id,
              newState,
              context.bap_id,
              {
                agent_name: f.agent?.name,
                agent_phone: f.agent?.phone,
                vehicle_registration: f.vehicle?.registration,
                tracking_url: f.tracking_url,
              },
            );
          }
        }
      }
    } catch (err) {
      logger.error(
        { err, action, transactionId: context.transaction_id },
        "Fulfillment tracking failed",
      );
    }

    // Settlement tracking
    const settlementService = new SettlementService(server.db);
    try {
      if (action === BecknAction.confirm) {
        const orderAmount = parseFloat(
          (message.order as any)?.quote?.price?.value ?? "0",
        );
        if (orderAmount > 0) {
          // Extract settlement params from payment tags or use defaults
          const paymentTags: any[] =
            (message.order as any)?.payment?.tags ??
            (message.order as any)?.payment?.["@ondc/org/settlement_details"]?.tags ??
            [];
          const findTag = (code: string): string | undefined =>
            paymentTags
              .flatMap((t: any) => t.list ?? [])
              .find((l: any) => l.code === code)?.value;

          const settlementBasisRaw = findTag("settlement_basis");
          const settlementBasis =
            (Object.values(SettlementBasis) as string[]).includes(settlementBasisRaw ?? "")
              ? (settlementBasisRaw as SettlementBasis)
              : SettlementBasis.Delivery;

          const withholdingPercent = parseFloat(findTag("withholding_amount") ?? "10");
          const finderFeeAmount = parseFloat(
            (message.order as any)?.payment?.["@ondc/org/buyer_app_finder_fee_amount"] ??
            findTag("@ondc/org/buyer_app_finder_fee_amount") ??
            "0",
          );

          await settlementService.createSettlementInstruction({
            orderId: orderResult.orderId,
            collectorSubscriberId: context.bap_id,
            receiverSubscriberId: server.config.bppId,
            amount: orderAmount,
            settlementBasis,
            settlementWindowDays: 1,
            withholdingPercent,
            finderFeeAmount,
            platformFeeAmount: 0,
          });
        }
      } else if (action === BecknAction.cancel) {
        // Check if order was paid and trigger refund via withholding pool
        const orderAmount = parseFloat(
          (message.order as any)?.quote?.price?.value ?? "0",
        );
        const cancellationCharges = parseFloat(
          (message.order as any)?.quote?.breakup?.find(
            (b: any) => b["@ondc/org/title_type"] === "cancellation",
          )?.price?.value ?? "0",
        );
        const refundAmount = orderAmount - cancellationCharges;
        if (refundAmount > 0) {
          await settlementService.useWithholdingForRefund(
            orderResult.orderId,
            refundAmount,
          );
        }
        await settlementService.updateSettlementStatus(
          orderResult.orderId,
          NocsTxnStatus.Reversed,
        );
      }
    } catch (err) {
      logger.error(
        { err, action, transactionId: context.transaction_id },
        "Settlement processing failed",
      );
    }

    // Build callback context (reuse originating message_id per ONDC spec)
    const callbackContext = buildContext({
      domain: context.domain,
      city: context.city,
      action: callbackAction,
      bap_id: context.bap_id,
      bap_uri: context.bap_uri,
      bpp_id: server.config.bppId,
      bpp_uri: server.config.bppUri,
      transaction_id: context.transaction_id,
      message_id: context.message_id,
    });

    // Enrich fulfillment data from DB for status responses
    let fulfillmentData = message.order?.fulfillments;
    if (action === BecknAction.status) {
      try {
        const dbFulfillments = await getFulfillmentsByOrderId(
          server.db,
          orderResult.orderId,
        );
        if (dbFulfillments.length > 0) {
          fulfillmentData = dbFulfillments.map((f) => ({
            id: f.fulfillment_id,
            type: f.type ?? "Delivery",
            state: {
              descriptor: {
                code: f.state ?? "Pending",
                name: f.state ?? "Pending",
              },
            },
            tracking: !!f.tracking_url,
            ...(f.agent_name ? { agent: { name: f.agent_name, phone: f.agent_phone ?? undefined } } : {}),
            ...(f.vehicle_registration ? { vehicle: { registration: f.vehicle_registration } } : {}),
          }));
        }
      } catch (err) {
        logger.error(
          { err, orderId: orderResult.orderId },
          "Failed to fetch fulfillment data for status",
        );
      }
    }

    // Include settlement info in status responses
    let paymentWithSettlement = message.order?.payment;
    if (action === BecknAction.status) {
      try {
        const settlements = await settlementService.getSettlementByOrderId(
          orderResult.orderId,
        );
        if (settlements.length > 0) {
          const s = settlements[0];
          paymentWithSettlement = {
            ...(message.order?.payment ?? {}),
            "@ondc/org/settlement_details": [
              {
                settlement_status: s.status,
                settlement_reference: s.settlement_reference ?? undefined,
                settlement_amount: s.net_payable,
                settlement_basis: s.settlement_basis,
              },
            ],
          } as any;
        }
      } catch (err) {
        logger.error(
          { err, orderId: orderResult.orderId },
          "Failed to fetch settlement for status",
        );
      }
    }

    // Build callback body with appropriate message shape
    const orderPayload: Record<string, unknown> = {
      id: (message.order?.id) ?? context.transaction_id,
      state: orderResult.state,
      provider: message.order?.provider,
      items: message.order?.items,
      billing: message.order?.billing,
      fulfillments: fulfillmentData,
      quote: message.order?.quote,
      payment: paymentWithSettlement,
    };

    // Mark force-cancelled orders with cancellation metadata
    if (isForceCancellation) {
      orderPayload.cancellation = {
        cancelled_by: "network",
        reason: { id: cancellationCode },
      };
      orderPayload.tags = [
        ...(Array.isArray((message.order as any)?.tags) ? (message.order as any).tags : []),
        { code: "force_cancel", list: [{ code: "initiated_by", value: "network" }] },
      ];
    }

    const callbackBody: BecknRequest = {
      context: callbackContext,
      message: { order: orderPayload },
    };

    // Log callback transaction (PII encrypted at rest)
    await server.db.insert(transactions).values({
      transaction_id: callbackContext.transaction_id,
      message_id: callbackContext.message_id,
      action: callbackAction,
      bap_id: callbackContext.bap_id,
      bpp_id: callbackContext.bpp_id,
      domain: callbackContext.domain,
      city: callbackContext.city,
      request_body: maskPiiInBody(callbackBody, fastify.piiKey),
      status: "SENT",
    });

    // Send callback to BAP
    await sendCallback(
      context.bap_uri,
      callbackAction,
      callbackBody,
      server.config.privateKey,
      server.config.bppId,
      server.config.uniqueKeyId,
    );
  }
};

/**
 * Return a sensible default order state based on the action type.
 */
function getDefaultOrderState(action: string): string {
  switch (action) {
    case BecknAction.select:
      return OrderState.Created;
    case BecknAction.init:
      return OrderState.Created;
    case BecknAction.confirm:
      return OrderState.Created;
    case BecknAction.cancel:
      return OrderState.Cancelled;
    case BecknAction.status:
    case BecknAction.track:
    case BecknAction.update:
    case BecknAction.rating:
    case BecknAction.support:
    default:
      return OrderState.Created;
  }
}
