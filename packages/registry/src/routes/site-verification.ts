import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { sign } from "@ondc/shared/crypto";
import { createLogger } from "@ondc/shared/utils";

const logger = createLogger("registry:site-verification");

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * GET /ondc-site-verification.html
 *
 * Serves the ONDC domain verification page. The ONDC registry checks this
 * URL during the subscriber onboarding process to verify that the domain
 * owner controls the subscriber_id.
 *
 * The page contains a meta tag with the Ed25519 signature of the request_id
 * (configured via ONDC_REQUEST_ID env var), signed with the registry's
 * private signing key (REGISTRY_SIGNING_PRIVATE_KEY env var).
 */
export const siteVerificationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/ondc-site-verification.html", async (request, reply) => {
    const requestId = process.env["ONDC_REQUEST_ID"] ?? "default-request-id";
    const privateKey = process.env["REGISTRY_SIGNING_PRIVATE_KEY"] ?? "";

    // Sign the request_id directly (without hashing) per ONDC spec
    let signedRequestId = "";
    if (privateKey) {
      try {
        signedRequestId = sign(requestId, privateKey);
        logger.debug({ requestId }, "Signed request_id for site verification");
      } catch (err) {
        logger.error({ err }, "Failed to sign request_id for site verification");
      }
    } else {
      logger.warn("REGISTRY_SIGNING_PRIVATE_KEY not set, site verification will return unsigned content");
    }

    reply.type("text/html").send(`<!DOCTYPE html>
<html>
  <head>
    <meta name="ondc-site-verification" content="${signedRequestId}" />
  </head>
  <body>ONDC Site Verification Page</body>
</html>`);
  });
};
