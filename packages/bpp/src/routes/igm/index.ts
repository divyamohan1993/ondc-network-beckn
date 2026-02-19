import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  IgmAction,
  IgmCallbackAction,
  IssueStatus,
  IGM_SLA,
  RespondentAction,
  validateBecknRequest,
  buildAuthHeader,
  buildContext,
  ack,
  nack,
  transactions,
  issues,
  createVerifyAuthMiddleware,
  createLogger,
} from "@ondc/shared";
import type {
  IssueRequest,
  OnIssueRequest,
  IssueStatusRequest,
  OnIssueStatusRequest,
} from "@ondc/shared";
import { request as httpRequest } from "undici";
import { eq } from "drizzle-orm";
import { notifyWebhook } from "../../services/webhook.js";

const logger = createLogger("bpp-igm");

// ---------------------------------------------------------------------------
// BPP IGM (Issue & Grievance Management) Routes
// ---------------------------------------------------------------------------
// The BPP is the seller-side participant. It:
//   - Receives issues from the BAP (POST /issue)
//   - Sends on_issue callback to the BAP (internal async)
//   - Receives issue_status queries from the BAP (POST /issue_status)
//   - Sends on_issue_status callback to the BAP (internal async)
// ---------------------------------------------------------------------------

/**
 * Send a signed IGM callback to the BAP.
 */
async function sendIgmCallback(
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

  logger.info({ url, callbackAction }, "Sending IGM callback to BAP");

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
        "BAP IGM callback returned non-200 status",
      );
    } else {
      logger.info({ url, callbackAction, statusCode }, "IGM callback sent to BAP");
    }
  } catch (err) {
    logger.error({ err, url, callbackAction }, "Failed to send IGM callback to BAP");
  }
}

export const registerIgmRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Auth verification for incoming requests from BAP
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // -------------------------------------------------------------------------
  // POST /issue  -  BPP receives issue from BAP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IssueRequest }>(
    `/${IgmAction.issue}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: IgmAction.issue, errors: validation.errors },
          "Invalid IGM issue request",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const issue = message.issue;

      try {
        // Persist the issue in the database
        await fastify.db.insert(issues).values({
          issue_id: issue.id,
          transaction_id: context.transaction_id,
          order_id: issue.order_details?.id ?? null,
          bap_id: context.bap_id,
          bpp_id: fastify.config.bppId,
          category: issue.category,
          sub_category: issue.sub_category,
          status: issue.status ?? IssueStatus.OPEN,
          short_desc: issue.description?.short_desc ?? issue.sub_category,
          long_desc: issue.description?.long_desc ?? null,
          complainant_info: issue.complainant_info ?? null,
          respondent_actions: issue.issue_actions?.respondent_actions ?? [],
          resolution: issue.resolution ?? null,
          resolution_provider: issue.resolution_provider ?? null,
        });

        // Log incoming transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmAction.issue,
          bap_id: context.bap_id,
          bpp_id: fastify.config.bppId,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify seller webhook (fire-and-forget)
        notifyWebhook(
          fastify.config.bppId,
          IgmAction.issue,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Seller webhook notification failed for issue",
          );
        });

        // Asynchronously send on_issue callback to BAP with PROCESSING status
        const callbackContext = buildContext({
          domain: context.domain,
          city: context.city,
          action: IgmCallbackAction.on_issue,
          bap_id: context.bap_id,
          bap_uri: context.bap_uri,
          bpp_id: fastify.config.bppId,
          bpp_uri: fastify.config.bppUri,
          transaction_id: context.transaction_id,
        });

        const callbackBody: OnIssueRequest = {
          context: callbackContext,
          message: {
            issue: {
              ...issue,
              status: IssueStatus.OPEN,
              issue_actions: {
                ...issue.issue_actions,
                respondent_actions: [
                  ...(issue.issue_actions?.respondent_actions ?? []),
                  {
                    respondent_action: RespondentAction.PROCESSING,
                    short_desc: "Issue is being reviewed",
                    updated_at: new Date().toISOString(),
                    updated_by: {
                      org: { name: fastify.config.bppId },
                    },
                  },
                ],
              },
              expected_response_time: {
                duration: IGM_SLA.EXPECTED_RESPONSE_TIME,
              },
              expected_resolution_time: {
                duration: IGM_SLA.EXPECTED_RESOLUTION_TIME,
              },
              updated_at: new Date().toISOString(),
            },
          },
        };

        // Log callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: callbackContext.transaction_id,
          message_id: callbackContext.message_id,
          action: IgmCallbackAction.on_issue,
          bap_id: callbackContext.bap_id,
          bpp_id: callbackContext.bpp_id,
          domain: callbackContext.domain,
          city: callbackContext.city,
          request_body: callbackBody,
          status: "SENT",
        });

        // Send on_issue callback to BAP (fire-and-forget)
        sendIgmCallback(
          context.bap_uri,
          IgmCallbackAction.on_issue,
          callbackBody,
          fastify.config.privateKey,
          fastify.config.bppId,
          fastify.config.uniqueKeyId,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Async on_issue callback failed",
          );
        });

        logger.info(
          { issueId: issue.id, transactionId: context.transaction_id },
          "Issue received and on_issue callback dispatched",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing IGM issue");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing issue."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /on_issue  -  BPP internal endpoint to send on_issue callback
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: {
      bap_uri: string;
      bap_id: string;
      transaction_id: string;
      domain?: string;
      city?: string;
      message: Record<string, unknown>;
    };
  }>(`/internal/${IgmCallbackAction.on_issue}`, async (request, reply) => {
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
      const callbackContext = buildContext({
        domain: domain ?? "nic2004:52110",
        city: city ?? "std:080",
        action: IgmCallbackAction.on_issue,
        bap_id,
        bap_uri,
        bpp_id: fastify.config.bppId,
        bpp_uri: fastify.config.bppUri,
        transaction_id,
      });

      const callbackBody = {
        context: callbackContext,
        message: message ?? {},
      };

      // Log the callback transaction
      await fastify.db.insert(transactions).values({
        transaction_id: callbackContext.transaction_id,
        message_id: callbackContext.message_id,
        action: IgmCallbackAction.on_issue,
        bap_id: callbackContext.bap_id,
        bpp_id: callbackContext.bpp_id,
        domain: callbackContext.domain,
        city: callbackContext.city,
        request_body: callbackBody,
        status: "SENT",
      });

      // Send callback to BAP (fire-and-forget)
      sendIgmCallback(
        bap_uri,
        IgmCallbackAction.on_issue,
        callbackBody,
        fastify.config.privateKey,
        fastify.config.bppId,
        fastify.config.uniqueKeyId,
      ).catch((err) => {
        logger.error(
          { err, transactionId: transaction_id },
          "Failed to send on_issue callback",
        );
      });

      return reply.code(200).send(ack());
    } catch (err) {
      logger.error({ err }, "Error sending on_issue callback");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error sending on_issue."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /issue_status  -  BPP receives issue_status query from BAP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IssueStatusRequest }>(
    `/${IgmAction.issue_status}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: IgmAction.issue_status, errors: validation.errors },
          "Invalid issue_status request",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const issueId = message.issue_id;

      try {
        // Log incoming transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmAction.issue_status,
          bap_id: context.bap_id,
          bpp_id: fastify.config.bppId,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Look up the issue from the database
        const issueRecords = await fastify.db
          .select()
          .from(issues)
          .where(eq(issues.issue_id, issueId))
          .limit(1);

        const issueRecord = issueRecords[0];

        // Build the on_issue_status callback
        const callbackContext = buildContext({
          domain: context.domain,
          city: context.city,
          action: IgmCallbackAction.on_issue_status,
          bap_id: context.bap_id,
          bap_uri: context.bap_uri,
          bpp_id: fastify.config.bppId,
          bpp_uri: fastify.config.bppUri,
          transaction_id: context.transaction_id,
        });

        const callbackBody: OnIssueStatusRequest = {
          context: callbackContext,
          message: {
            issue: {
              id: issueId,
              category: issueRecord?.category ?? "ORDER",
              sub_category: (issueRecord?.sub_category ?? "ORD01") as import("@ondc/shared").IssueSubCategory,
              status: (issueRecord?.status ?? IssueStatus.OPEN) as IssueStatus,
              issue_actions: {
                respondent_actions: (issueRecord?.respondent_actions ?? []) as import("@ondc/shared").RespondentInfo[],
              },
              resolution: (issueRecord?.resolution ?? undefined) as import("@ondc/shared").IssueResolution | undefined,
              resolution_provider: (issueRecord?.resolution_provider ?? undefined) as import("@ondc/shared").Issue["resolution_provider"],
              created_at: issueRecord?.created_at?.toISOString() ?? new Date().toISOString(),
              updated_at: issueRecord?.updated_at?.toISOString() ?? new Date().toISOString(),
            },
          },
        };

        // Log callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: callbackContext.transaction_id,
          message_id: callbackContext.message_id,
          action: IgmCallbackAction.on_issue_status,
          bap_id: callbackContext.bap_id,
          bpp_id: callbackContext.bpp_id,
          domain: callbackContext.domain,
          city: callbackContext.city,
          request_body: callbackBody,
          status: "SENT",
        });

        // Send on_issue_status callback to BAP (fire-and-forget)
        sendIgmCallback(
          context.bap_uri,
          IgmCallbackAction.on_issue_status,
          callbackBody,
          fastify.config.privateKey,
          fastify.config.bppId,
          fastify.config.uniqueKeyId,
        ).catch((err) => {
          logger.error(
            { err, issueId, transactionId: context.transaction_id },
            "Async on_issue_status callback failed",
          );
        });

        logger.info(
          { issueId, transactionId: context.transaction_id },
          "issue_status received and on_issue_status callback dispatched",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing issue_status");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing issue_status."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /on_issue_status  -  BPP internal endpoint to send on_issue_status
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: {
      bap_uri: string;
      bap_id: string;
      transaction_id: string;
      domain?: string;
      city?: string;
      message: Record<string, unknown>;
    };
  }>(`/internal/${IgmCallbackAction.on_issue_status}`, async (request, reply) => {
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
      const callbackContext = buildContext({
        domain: domain ?? "nic2004:52110",
        city: city ?? "std:080",
        action: IgmCallbackAction.on_issue_status,
        bap_id,
        bap_uri,
        bpp_id: fastify.config.bppId,
        bpp_uri: fastify.config.bppUri,
        transaction_id,
      });

      const callbackBody = {
        context: callbackContext,
        message: message ?? {},
      };

      // Log the callback transaction
      await fastify.db.insert(transactions).values({
        transaction_id: callbackContext.transaction_id,
        message_id: callbackContext.message_id,
        action: IgmCallbackAction.on_issue_status,
        bap_id: callbackContext.bap_id,
        bpp_id: callbackContext.bpp_id,
        domain: callbackContext.domain,
        city: callbackContext.city,
        request_body: callbackBody,
        status: "SENT",
      });

      // Send callback to BAP (fire-and-forget)
      sendIgmCallback(
        bap_uri,
        IgmCallbackAction.on_issue_status,
        callbackBody,
        fastify.config.privateKey,
        fastify.config.bppId,
        fastify.config.uniqueKeyId,
      ).catch((err) => {
        logger.error(
          { err, transactionId: transaction_id },
          "Failed to send on_issue_status callback",
        );
      });

      return reply.code(200).send(ack());
    } catch (err) {
      logger.error({ err }, "Error sending on_issue_status callback");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error sending on_issue_status."),
      );
    }
  });
};
