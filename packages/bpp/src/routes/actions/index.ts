import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknAction,
  BecknCallbackAction,
  validateBecknRequest,
  buildContext,
  buildAuthHeader,
  ack,
  nack,
  transactions,
  createVerifyAuthMiddleware,
  createVerifyGatewayAuthMiddleware,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { request as httpRequest } from "undici";
import { buildOnSearchResponse } from "../../services/catalog.js";
import { notifyWebhook } from "../../services/webhook.js";
import { processOrderAction } from "../../services/order-manager.js";

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
          // Log incoming transaction
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action,
            bap_id: context.bap_id,
            bpp_id: fastify.config.bppId,
            domain: context.domain,
            city: context.city,
            request_body: body,
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
            nack("INTERNAL-ERROR", "20000", "Internal error processing action."),
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
    );

    // Build callback context
    const callbackContext = buildContext({
      domain: context.domain,
      city: context.city,
      action: callbackAction,
      bap_id: context.bap_id,
      bap_uri: context.bap_uri,
      bpp_id: server.config.bppId,
      bpp_uri: server.config.bppUri,
      transaction_id: context.transaction_id,
    });

    const callbackBody: BecknRequest = {
      context: callbackContext,
      message: {
        catalog: catalog ?? {
          "bpp/descriptor": { name: "No catalog available" },
          "bpp/providers": [],
        },
      },
    };

    // Log callback transaction
    await server.db.insert(transactions).values({
      transaction_id: callbackContext.transaction_id,
      message_id: callbackContext.message_id,
      action: callbackAction,
      bap_id: callbackContext.bap_id,
      bpp_id: callbackContext.bpp_id,
      domain: callbackContext.domain,
      city: callbackContext.city,
      request_body: callbackBody,
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

    // Persist order state
    let orderResult = { orderId: context.transaction_id, state: getDefaultOrderState(action) };
    try {
      orderResult = await processOrderAction(server.db, action, context, message);
    } catch (err) {
      logger.error({ err, action, transactionId: context.transaction_id }, "Order persistence failed");
    }

    // Build callback context
    const callbackContext = buildContext({
      domain: context.domain,
      city: context.city,
      action: callbackAction,
      bap_id: context.bap_id,
      bap_uri: context.bap_uri,
      bpp_id: server.config.bppId,
      bpp_uri: server.config.bppUri,
      transaction_id: context.transaction_id,
    });

    // Build callback body with appropriate message shape
    const callbackBody: BecknRequest = {
      context: callbackContext,
      message: {
        order: {
          id: (message.order?.id) ?? context.transaction_id,
          state: orderResult.state,
          provider: message.order?.provider,
          items: message.order?.items,
          billing: message.order?.billing,
          fulfillments: message.order?.fulfillments,
          quote: message.order?.quote,
          payment: message.order?.payment,
        },
      },
    };

    // Log callback transaction
    await server.db.insert(transactions).values({
      transaction_id: callbackContext.transaction_id,
      message_id: callbackContext.message_id,
      action: callbackAction,
      bap_id: callbackContext.bap_id,
      bpp_id: callbackContext.bpp_id,
      domain: callbackContext.domain,
      city: callbackContext.city,
      request_body: callbackBody,
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
      return "SELECTED";
    case BecknAction.init:
      return "INITIALIZED";
    case BecknAction.confirm:
      return "ACCEPTED";
    case BecknAction.status:
      return "IN_PROGRESS";
    case BecknAction.track:
      return "IN_PROGRESS";
    case BecknAction.cancel:
      return "CANCELLED";
    case BecknAction.update:
      return "UPDATED";
    case BecknAction.rating:
      return "RATED";
    case BecknAction.support:
      return "ACTIVE";
    default:
      return "ACTIVE";
  }
}
