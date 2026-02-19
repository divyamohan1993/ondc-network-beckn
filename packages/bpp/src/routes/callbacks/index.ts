import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknCallbackAction,
  buildContext,
  buildAuthHeader,
  ack,
  nack,
  transactions,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { request as httpRequest } from "undici";

const logger = createLogger("bpp-callbacks");

/**
 * All 10 Beckn callback actions that the BPP sends outward to BAPs.
 */
const BECKN_CALLBACKS = Object.values(BecknCallbackAction);

/**
 * Register internal callback-sending routes.
 *
 * These are used by the provider API (or internal processing) to trigger
 * sending of signed on_{action} responses back to the BAP's callback URL.
 *
 * Internal routes:
 *   POST /internal/on_{action}
 *   Body: { bap_uri, bap_id, transaction_id, domain, city, message }
 *
 * Each route:
 *   - Builds the proper Beckn callback context
 *   - Signs the request with the BPP's Ed25519 private key
 *   - Sends the callback to the BAP's URI
 *   - Logs the transaction in the database
 *   - Returns ACK
 */
export const registerCallbackRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  for (const callbackAction of BECKN_CALLBACKS) {
    fastify.post<{
      Body: {
        bap_uri: string;
        bap_id: string;
        transaction_id: string;
        domain?: string;
        city?: string;
        message: Record<string, unknown>;
      };
    }>(`/internal/${callbackAction}`, async (request, reply) => {
      const { bap_uri, bap_id, transaction_id, domain, city, message } =
        request.body;

      if (!bap_uri || !bap_id || !transaction_id) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "bap_uri, bap_id, and transaction_id are required.",
          ),
        );
      }

      try {
        // Build the callback context
        const callbackContext = buildContext({
          domain: domain ?? "nic2004:52110",
          city: city ?? "std:080",
          action: callbackAction,
          bap_id,
          bap_uri,
          bpp_id: fastify.config.bppId,
          bpp_uri: fastify.config.bppUri,
          transaction_id,
        });

        const callbackBody: BecknRequest = {
          context: callbackContext,
          message: message ?? {},
        };

        // Sign the request
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bppId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body: callbackBody,
        });

        // Log the callback transaction
        await fastify.db.insert(transactions).values({
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

        // Send callback to BAP (fire-and-forget for quick ACK)
        const url = `${bap_uri.replace(/\/+$/, "")}/${callbackAction}`;

        httpRequest(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(callbackBody),
        })
          .then(async (response) => {
            const responseText = await response.body.text();
            if (response.statusCode !== 200) {
              logger.warn(
                { url, statusCode: response.statusCode, response: responseText },
                "BAP callback returned non-200",
              );
            } else {
              logger.info({ url, callbackAction }, "Callback sent to BAP");
            }
          })
          .catch((err) => {
            logger.error(
              { err, url, callbackAction },
              "Failed to send callback to BAP",
            );
          });

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err, callbackAction }, "Error sending callback");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error sending callback."),
        );
      }
    });
  }
};
