import { request as httpRequest } from "undici";
import { buildAuthHeader, createLogger } from "@ondc/shared";

const logger = createLogger("bap-beckn-client");

/**
 * HTTP client for outgoing Beckn protocol calls from the BAP.
 *
 * Handles signing requests with Ed25519 and sending them to the
 * appropriate network participant (Gateway for search, BPP for others).
 */
export class BecknClient {
  /**
   * Send a signed Beckn request to the ONDC Gateway.
   * Used for the `search` action which is routed through the gateway.
   *
   * @param action - The Beckn action (e.g. "search").
   * @param body - The full Beckn request body (context + message).
   * @param privateKey - Base64-encoded Ed25519 private key for signing.
   * @param subscriberId - The BAP subscriber ID.
   * @param keyId - The unique key ID for the BAP.
   * @returns The parsed JSON response from the gateway.
   */
  async sendToGateway(
    gatewayUrl: string,
    action: string,
    body: object,
    privateKey: string,
    subscriberId: string,
    keyId: string,
  ): Promise<unknown> {
    const authHeader = buildAuthHeader({
      subscriberId,
      uniqueKeyId: keyId,
      privateKey,
      body,
    });

    const url = `${gatewayUrl.replace(/\/+$/, "")}/${action}`;

    logger.info({ url, action }, "Sending request to gateway");

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
          "Gateway returned non-200 status",
        );
      }

      return JSON.parse(responseText);
    } catch (err) {
      logger.error({ err, url, action }, "Failed to send request to gateway");
      throw err;
    }
  }

  /**
   * Send a signed Beckn request directly to a BPP.
   * Used for all actions other than `search`.
   *
   * @param bppUri - The base URI of the target BPP.
   * @param action - The Beckn action (e.g. "select", "init", "confirm").
   * @param body - The full Beckn request body (context + message).
   * @param privateKey - Base64-encoded Ed25519 private key for signing.
   * @param subscriberId - The BAP subscriber ID.
   * @param keyId - The unique key ID for the BAP.
   * @returns The parsed JSON response from the BPP.
   */
  async sendToBPP(
    bppUri: string,
    action: string,
    body: object,
    privateKey: string,
    subscriberId: string,
    keyId: string,
  ): Promise<unknown> {
    const authHeader = buildAuthHeader({
      subscriberId,
      uniqueKeyId: keyId,
      privateKey,
      body,
    });

    const url = `${bppUri.replace(/\/+$/, "")}/${action}`;

    logger.info({ url, action }, "Sending request to BPP");

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
          "BPP returned non-200 status",
        );
      }

      return JSON.parse(responseText);
    } catch (err) {
      logger.error({ err, url, action }, "Failed to send request to BPP");
      throw err;
    }
  }
}
