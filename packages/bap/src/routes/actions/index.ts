import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknAction,
  validateBecknRequest,
  ack,
  nack,
  transactions,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { BecknClient } from "../../services/beckn-client.js";

const logger = createLogger("bap-actions");

/**
 * All 10 Beckn actions that the BAP can send outward.
 * - search: routed through the gateway
 * - all others: sent directly to the BPP
 */
const BECKN_ACTIONS = Object.values(BecknAction);

/**
 * Register all 10 Beckn action routes dynamically.
 *
 * Each route:
 *   POST /{action}
 *   - Validates the incoming Beckn request body
 *   - Signs the request with the BAP's Ed25519 private key
 *   - For "search": sends to the gateway URL
 *   - For all others: sends directly to the BPP URL from context.bpp_uri
 *   - Logs the transaction in the database
 *   - Returns ACK
 */
export const registerActionRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const becknClient = new BecknClient();

  for (const action of BECKN_ACTIONS) {
    fastify.post<{ Body: BecknRequest }>(
      `/${action}`,
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
          // Log transaction as SENT
          await fastify.db.insert(transactions).values({
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            action,
            bap_id: context.bap_id,
            bpp_id: context.bpp_id ?? null,
            domain: context.domain,
            city: context.city,
            request_body: body,
            status: "SENT",
          });

          // Send the signed request
          if (action === BecknAction.search) {
            // Search goes through the gateway
            becknClient
              .sendToGateway(
                fastify.config.gatewayUrl,
                action,
                body,
                fastify.config.privateKey,
                fastify.config.bapId,
                fastify.config.uniqueKeyId,
              )
              .catch((err) => {
                logger.error(
                  { err, action, transactionId: context.transaction_id },
                  "Async gateway send failed",
                );
              });
          } else {
            // All other actions go directly to BPP
            const bppUri = context.bpp_uri;
            if (!bppUri) {
              logger.warn(
                { action, transactionId: context.transaction_id },
                "Missing bpp_uri in context",
              );
              return reply.code(400).send(
                nack(
                  "CONTEXT-ERROR",
                  "10000",
                  "context.bpp_uri is required for non-search actions.",
                ),
              );
            }

            becknClient
              .sendToBPP(
                bppUri,
                action,
                body,
                fastify.config.privateKey,
                fastify.config.bapId,
                fastify.config.uniqueKeyId,
              )
              .catch((err) => {
                logger.error(
                  { err, action, transactionId: context.transaction_id },
                  "Async BPP send failed",
                );
              });
          }

          logger.info(
            { action, transactionId: context.transaction_id },
            "Action dispatched",
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
};
