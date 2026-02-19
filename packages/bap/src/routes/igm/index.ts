import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  IgmAction,
  IgmCallbackAction,
  IssueStatus,
  IGM_SLA,
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

const logger = createLogger("bap-igm");

// ---------------------------------------------------------------------------
// BAP IGM (Issue & Grievance Management) Routes
// ---------------------------------------------------------------------------
// The BAP is the buyer-side participant. It:
//   - Raises issues on behalf of the buyer (POST /issue)
//   - Receives on_issue callbacks from the BPP (POST /on_issue)
//   - Sends issue_status queries to the BPP (POST /issue_status)
//   - Receives on_issue_status callbacks from the BPP (POST /on_issue_status)
// ---------------------------------------------------------------------------

export const registerIgmRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Auth verification for incoming callbacks from BPP
  const verifyAuth = createVerifyAuthMiddleware({
    registryUrl: fastify.config.registryUrl,
    redisClient: fastify.redis,
  });

  // -------------------------------------------------------------------------
  // POST /issue  -  BAP raises an issue (sends to BPP)
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IssueRequest }>(
    `/${IgmAction.issue}`,
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

      if (!context.bpp_uri) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "context.bpp_uri is required to raise an issue.",
          ),
        );
      }

      try {
        // Persist the issue in the database
        await fastify.db.insert(issues).values({
          issue_id: issue.id,
          transaction_id: context.transaction_id,
          order_id: issue.order_details?.id ?? null,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? "",
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

        // Log the transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmAction.issue,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "SENT",
        });

        // Sign and forward to BPP (fire-and-forget)
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bapId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body,
        });

        const bppUrl = `${context.bpp_uri.replace(/\/+$/, "")}/${IgmAction.issue}`;

        httpRequest(bppUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
        }).catch((err) => {
          logger.error(
            { err, url: bppUrl, transactionId: context.transaction_id },
            "Failed to send issue to BPP",
          );
        });

        logger.info(
          { issueId: issue.id, transactionId: context.transaction_id },
          "Issue raised and dispatched to BPP",
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
  // POST /on_issue  -  BAP receives on_issue callback from BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OnIssueRequest }>(
    `/${IgmCallbackAction.on_issue}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: IgmCallbackAction.on_issue, errors: validation.errors },
          "Invalid on_issue callback",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const issue = message.issue;

      try {
        // Update the issue record in the database
        await fastify.db
          .update(issues)
          .set({
            status: issue.status,
            respondent_actions: issue.issue_actions?.respondent_actions ?? [],
            resolution: issue.resolution ?? null,
            resolution_provider: issue.resolution_provider ?? null,
            updated_at: new Date(),
          })
          .where(eq(issues.issue_id, issue.id));

        // Log the callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmCallbackAction.on_issue,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify buyer app webhook (fire-and-forget)
        notifyWebhook(
          context.bap_id,
          IgmCallbackAction.on_issue,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Webhook notification failed for on_issue",
          );
        });

        logger.info(
          { issueId: issue.id, status: issue.status, transactionId: context.transaction_id },
          "on_issue callback received and processed",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing on_issue callback");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing on_issue."),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /issue_status  -  BAP checks issue status (sends to BPP)
  // -------------------------------------------------------------------------
  fastify.post<{ Body: IssueStatusRequest }>(
    `/${IgmAction.issue_status}`,
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
      const { context } = body;

      if (!context.bpp_uri) {
        return reply.code(400).send(
          nack(
            "CONTEXT-ERROR",
            "10000",
            "context.bpp_uri is required for issue_status.",
          ),
        );
      }

      try {
        // Log the transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmAction.issue_status,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "SENT",
        });

        // Sign and forward to BPP (fire-and-forget)
        const authHeader = buildAuthHeader({
          subscriberId: fastify.config.bapId,
          uniqueKeyId: fastify.config.uniqueKeyId,
          privateKey: fastify.config.privateKey,
          body,
        });

        const bppUrl = `${context.bpp_uri.replace(/\/+$/, "")}/${IgmAction.issue_status}`;

        httpRequest(bppUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
        }).catch((err) => {
          logger.error(
            { err, url: bppUrl, transactionId: context.transaction_id },
            "Failed to send issue_status to BPP",
          );
        });

        logger.info(
          { transactionId: context.transaction_id },
          "issue_status dispatched to BPP",
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
  // POST /on_issue_status  -  BAP receives on_issue_status callback from BPP
  // -------------------------------------------------------------------------
  fastify.post<{ Body: OnIssueStatusRequest }>(
    `/${IgmCallbackAction.on_issue_status}`,
    { preHandler: verifyAuth },
    async (request, reply) => {
      const validation = validateBecknRequest(request.body);
      if (!validation.valid) {
        logger.warn(
          { action: IgmCallbackAction.on_issue_status, errors: validation.errors },
          "Invalid on_issue_status callback",
        );
        return reply.code(400).send(
          nack("CONTEXT-ERROR", "10000", validation.errors.join("; ")),
        );
      }

      const body = request.body;
      const { context, message } = body;
      const issue = message.issue;

      try {
        // Update the issue record in the database
        await fastify.db
          .update(issues)
          .set({
            status: issue.status,
            respondent_actions: issue.issue_actions?.respondent_actions ?? [],
            resolution: issue.resolution ?? null,
            resolution_provider: issue.resolution_provider ?? null,
            updated_at: new Date(),
          })
          .where(eq(issues.issue_id, issue.id));

        // Log the callback transaction
        await fastify.db.insert(transactions).values({
          transaction_id: context.transaction_id,
          message_id: context.message_id,
          action: IgmCallbackAction.on_issue_status,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? null,
          domain: context.domain,
          city: context.city,
          request_body: body,
          status: "ACK",
        });

        // Notify buyer app webhook (fire-and-forget)
        notifyWebhook(
          context.bap_id,
          IgmCallbackAction.on_issue_status,
          body,
          fastify.redis,
        ).catch((err) => {
          logger.error(
            { err, transactionId: context.transaction_id },
            "Webhook notification failed for on_issue_status",
          );
        });

        logger.info(
          { issueId: issue.id, status: issue.status, transactionId: context.transaction_id },
          "on_issue_status callback received and processed",
        );

        return reply.code(200).send(ack());
      } catch (err) {
        logger.error({ err }, "Error processing on_issue_status callback");
        return reply.code(500).send(
          nack("INTERNAL-ERROR", "20000", "Internal error processing on_issue_status."),
        );
      }
    },
  );
};
