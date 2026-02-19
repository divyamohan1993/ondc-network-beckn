import { request as httpRequest } from "undici";
import {
  buildAuthHeader,
  buildGatewayAuthHeader,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";

const logger = createLogger("gateway-response-agg");

/**
 * Result of forwarding an on_search response to a BAP.
 */
export interface ForwardResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Response aggregator that handles forwarding on_search callbacks
 * from BPPs back to the originating BAP.
 *
 * Each BPP sends its on_search response to the gateway. The gateway
 * signs the response with its own key and forwards it to the BAP's
 * callback URL (context.bap_uri + /on_search).
 */
export class ResponseAggregator {
  /**
   * Forward an on_search response to the originating BAP.
   *
   * Steps:
   *   1. Sign the on_search body with the gateway's Ed25519 key
   *   2. Build both Authorization and X-Gateway-Authorization headers
   *   3. HTTP POST to bapUri + /on_search
   *   4. Return success/failure result
   *
   * @param bapUri - The BAP's base callback URI (context.bap_uri).
   * @param onSearchResponse - The on_search response body from the BPP.
   * @param gatewayPrivateKey - Gateway's Ed25519 private key (base64).
   * @param gatewaySubscriberId - Gateway's subscriber_id.
   * @param gatewayKeyId - Gateway's unique_key_id.
   * @returns ForwardResult indicating success or failure.
   */
  async forwardToBAP(
    bapUri: string,
    onSearchResponse: BecknRequest,
    gatewayPrivateKey: string,
    gatewaySubscriberId: string,
    gatewayKeyId: string,
  ): Promise<ForwardResult> {
    const transactionId = onSearchResponse.context.transaction_id;
    const targetUrl = bapUri.replace(/\/+$/, "") + "/on_search";

    logger.info(
      { bapUri: targetUrl, transactionId },
      "Forwarding on_search response to BAP",
    );

    try {
      // Sign with gateway's key for Authorization header
      const authHeader = buildAuthHeader({
        subscriberId: gatewaySubscriberId,
        uniqueKeyId: gatewayKeyId,
        privateKey: gatewayPrivateKey,
        body: onSearchResponse,
      });

      // Sign with gateway's key for X-Gateway-Authorization header
      const gatewayAuthHeader = buildGatewayAuthHeader({
        subscriberId: gatewaySubscriberId,
        uniqueKeyId: gatewayKeyId,
        privateKey: gatewayPrivateKey,
        body: onSearchResponse,
      });

      const { statusCode } = await httpRequest(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-Gateway-Authorization": gatewayAuthHeader,
        },
        body: JSON.stringify(onSearchResponse),
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });

      if (statusCode >= 200 && statusCode < 300) {
        logger.info(
          { bapUri: targetUrl, transactionId, statusCode },
          "on_search forwarded successfully to BAP",
        );
        return { success: true, statusCode };
      }

      logger.warn(
        { bapUri: targetUrl, transactionId, statusCode },
        "BAP returned non-2xx for on_search",
      );
      return {
        success: false,
        statusCode,
        error: `BAP returned status ${statusCode}`,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, bapUri: targetUrl, transactionId },
        "Error forwarding on_search to BAP",
      );
      return { success: false, error: errorMessage };
    }
  }
}
