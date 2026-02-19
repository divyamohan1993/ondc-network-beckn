import type { FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("finder-fee-validator");

/**
 * Actions that require finder fee validation per ONDC spec.
 */
const FINDER_FEE_REQUIRED_ACTIONS = ["select", "init", "confirm"];

/**
 * Actions that require settlement details in payment.
 */
const SETTLEMENT_REQUIRED_ACTIONS = ["confirm"];

export interface FinderFeeValidatorConfig {
  /** Whether to enforce settlement details on confirm. Default: true */
  enforceSettlement?: boolean;
}

/**
 * Create a Fastify preHandler that validates ONDC buyer app finder fee
 * fields in the payment object during select/init/confirm flows.
 *
 * Per ONDC policy, the BAP must declare its finder fee in every order
 * lifecycle message so the BPP can compute the correct settlement split.
 */
export function createFinderFeeValidator(config: FinderFeeValidatorConfig = {}) {
  const { enforceSettlement = true } = config;

  return async function finderFeeValidatorPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return;

    const context = body["context"] as Record<string, unknown> | undefined;
    if (!context) return;

    const action = context["action"] as string | undefined;
    if (!action || !FINDER_FEE_REQUIRED_ACTIONS.includes(action)) {
      return; // Not a relevant action, skip
    }

    const message = body["message"] as Record<string, unknown> | undefined;
    const order = message?.["order"] as Record<string, unknown> | undefined;
    if (!order) return;

    const payment = order["payment"] as Record<string, unknown> | undefined;
    if (!payment) {
      logger.warn({ action }, "Missing payment object in order for finder fee validation");
      reply.code(400).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "POLICY-ERROR",
          code: "30004",
          message: "Payment object is required in order for this action.",
        },
      });
      return;
    }

    // Validate finder fee type
    const feeType = payment["@ondc/org/buyer_app_finder_fee_type"] as string | undefined;
    const feeAmount = payment["@ondc/org/buyer_app_finder_fee_amount"] as string | undefined;

    if (!feeType || !feeAmount) {
      logger.warn(
        { action, feeType, feeAmount },
        "Missing ONDC buyer app finder fee fields",
      );
      reply.code(400).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "POLICY-ERROR",
          code: "30004",
          message:
            "Payment must include @ondc/org/buyer_app_finder_fee_type and @ondc/org/buyer_app_finder_fee_amount.",
        },
      });
      return;
    }

    // Validate fee type value
    if (feeType !== "percent" && feeType !== "amount") {
      logger.warn({ action, feeType }, "Invalid finder fee type");
      reply.code(400).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "POLICY-ERROR",
          code: "30004",
          message: `Invalid @ondc/org/buyer_app_finder_fee_type: "${feeType}". Must be "percent" or "amount".`,
        },
      });
      return;
    }

    // Validate fee amount
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount < 0) {
      logger.warn({ action, feeAmount }, "Invalid finder fee amount");
      reply.code(400).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "POLICY-ERROR",
          code: "30004",
          message: `Invalid @ondc/org/buyer_app_finder_fee_amount: "${feeAmount}". Must be a non-negative number.`,
        },
      });
      return;
    }

    if (feeType === "percent" && amount > 100) {
      logger.warn({ action, feeAmount }, "Finder fee percentage exceeds 100");
      reply.code(400).send({
        message: { ack: { status: "NACK" } },
        error: {
          type: "POLICY-ERROR",
          code: "30004",
          message: `Finder fee percentage cannot exceed 100. Got: "${feeAmount}".`,
        },
      });
      return;
    }

    // Validate quote breakup includes convenience_fee line (for init/confirm)
    if (action === "init" || action === "confirm") {
      const quote = order["quote"] as Record<string, unknown> | undefined;
      if (quote) {
        const breakup = quote["breakup"] as Array<Record<string, unknown>> | undefined;
        if (breakup && breakup.length > 0) {
          const hasConvenienceFee = breakup.some(
            (item) => item["@ondc/org/title_type"] === "convenience_fee",
          );
          if (!hasConvenienceFee) {
            logger.warn({ action }, "Quote breakup missing convenience_fee line item");
            // This is a warning, not a hard block - some domains may not require it
            logger.info(
              { action },
              "Allowing request without convenience_fee in breakup (soft validation)",
            );
          }
        }
      }
    }

    // Validate settlement details on confirm
    if (enforceSettlement && SETTLEMENT_REQUIRED_ACTIONS.includes(action)) {
      const settlementDetails = payment["@ondc/org/settlement_details"] as
        | Array<Record<string, unknown>>
        | undefined;

      if (!settlementDetails || settlementDetails.length === 0) {
        logger.warn({ action }, "Missing settlement details in payment for confirm");
        reply.code(400).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "POLICY-ERROR",
            code: "30004",
            message:
              "Payment must include @ondc/org/settlement_details for order confirmation.",
          },
        });
        return;
      }

      // Validate each settlement detail has required fields
      for (const detail of settlementDetails) {
        if (!detail["settlement_counterparty"] || !detail["settlement_type"]) {
          logger.warn({ action, detail }, "Incomplete settlement detail entry");
          reply.code(400).send({
            message: { ack: { status: "NACK" } },
            error: {
              type: "POLICY-ERROR",
              code: "30004",
              message:
                "Each settlement detail must include settlement_counterparty and settlement_type.",
            },
          });
          return;
        }
      }
    }

    logger.debug({ action, feeType, feeAmount }, "Finder fee validation passed");
  };
}
