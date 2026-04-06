import { eq, and, lt } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { settlementInstructions, withholdingPool, nbblRegistrations } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import { sign } from "../crypto/ed25519.js";
import { SettlementBasis, NocsTxnStatus } from "../protocol/rsf-types.js";
import { validateIfsc } from "./ifsc-service.js";

const logger = createLogger("settlement-service");

export class SettlementService {
  constructor(private db: Database) {}

  /**
   * Create a settlement instruction when an order is confirmed.
   */
  async createSettlementInstruction(params: {
    orderId: string;
    collectorSubscriberId: string;
    receiverSubscriberId: string;
    amount: number;
    settlementBasis: SettlementBasis;
    settlementWindowDays: number;
    withholdingPercent: number;
    finderFeeAmount: number;
    platformFeeAmount: number;
    signingKey?: string;
    subscriberId?: string;
  }): Promise<string> {
    const withholdingAmount = (params.amount * params.withholdingPercent) / 100;
    const netPayable = params.amount - params.finderFeeAmount - params.platformFeeAmount - withholdingAmount;

    // Check for duplicate settlement instruction (double-spend prevention)
    const existing = await this.db
      .select({ id: settlementInstructions.id })
      .from(settlementInstructions)
      .where(
        and(
          eq(settlementInstructions.order_id, params.orderId),
          eq(settlementInstructions.collector_subscriber_id, params.collectorSubscriberId),
          eq(settlementInstructions.receiver_subscriber_id, params.receiverSubscriberId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      logger.warn(
        { orderId: params.orderId, collector: params.collectorSubscriberId, receiver: params.receiverSubscriberId },
        "Duplicate settlement instruction detected, returning existing",
      );
      return existing[0]!.id;
    }

    // Sign the settlement instruction if a signing key is provided
    let signature: string | undefined;
    let signedBy: string | undefined;
    if (params.signingKey && params.subscriberId) {
      const signingString = `${params.orderId}|${params.collectorSubscriberId}|${params.receiverSubscriberId}|${params.amount}|${netPayable}|${params.settlementBasis}`;
      signature = sign(signingString, params.signingKey);
      signedBy = params.subscriberId;
    }

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + params.settlementWindowDays);

    const [result] = await this.db.insert(settlementInstructions).values({
      order_id: params.orderId,
      collector_subscriber_id: params.collectorSubscriberId,
      receiver_subscriber_id: params.receiverSubscriberId,
      amount: String(params.amount),
      settlement_basis: params.settlementBasis,
      settlement_window_start: now,
      settlement_due_date: dueDate,
      withholding_amount: String(withholdingAmount),
      finder_fee_amount: String(params.finderFeeAmount),
      platform_fee_amount: String(params.platformFeeAmount),
      net_payable: String(netPayable),
      status: NocsTxnStatus.Initiated,
      signature: signature ?? null,
      signed_by: signedBy ?? null,
    }).onConflictDoNothing().returning({ id: settlementInstructions.id });

    // If onConflictDoNothing triggered, fetch the existing record
    if (!result) {
      const [fallback] = await this.db
        .select({ id: settlementInstructions.id })
        .from(settlementInstructions)
        .where(
          and(
            eq(settlementInstructions.order_id, params.orderId),
            eq(settlementInstructions.collector_subscriber_id, params.collectorSubscriberId),
            eq(settlementInstructions.receiver_subscriber_id, params.receiverSubscriberId),
          ),
        )
        .limit(1);
      logger.warn({ orderId: params.orderId }, "Settlement instruction conflict resolved, returning existing");
      return fallback!.id;
    }

    if (withholdingAmount > 0) {
      const releaseDate = new Date(now);
      releaseDate.setDate(releaseDate.getDate() + params.settlementWindowDays + 7);

      await this.db.insert(withholdingPool).values({
        order_id: params.orderId,
        collector_subscriber_id: params.collectorSubscriberId,
        withheld_amount: String(withholdingAmount),
        release_date: releaseDate,
      });
    }

    logger.info({ orderId: params.orderId, netPayable, dueDate, signed: !!signature }, "Settlement instruction created");
    return result.id;
  }

  /**
   * Update settlement status (called by NOCS webhook or polling).
   */
  async updateSettlementStatus(
    orderId: string,
    status: NocsTxnStatus,
    settlementReference?: string,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (settlementReference) {
      updates.settlement_reference = settlementReference;
    }
    if (status === NocsTxnStatus.Settled) {
      updates.settled_at = new Date();
    }

    await this.db
      .update(settlementInstructions)
      .set(updates)
      .where(eq(settlementInstructions.order_id, orderId));

    logger.info({ orderId, status, settlementReference }, "Settlement status updated");
  }

  /**
   * Release withholding pool for orders past the return window.
   */
  async releaseExpiredWithholdings(): Promise<number> {
    const now = new Date();
    const result = await this.db
      .update(withholdingPool)
      .set({ released: true, released_at: now })
      .where(
        and(
          eq(withholdingPool.released, false),
          lt(withholdingPool.release_date, now),
        ),
      )
      .returning({ id: withholdingPool.id });

    if (result.length > 0) {
      logger.info({ count: result.length }, "Released expired withholdings");
    }
    return result.length;
  }

  /**
   * Use withholding pool for a refund.
   */
  async useWithholdingForRefund(orderId: string, refundAmount: number): Promise<boolean> {
    const [pool] = await this.db
      .select()
      .from(withholdingPool)
      .where(and(
        eq(withholdingPool.order_id, orderId),
        eq(withholdingPool.released, false),
      ))
      .limit(1);

    if (!pool) {
      logger.warn({ orderId }, "No withholding pool found for refund");
      return false;
    }

    const available = Number(pool.withheld_amount) - Number(pool.refund_used);
    if (refundAmount > available) {
      logger.warn({ orderId, refundAmount, available }, "Insufficient withholding for refund");
      return false;
    }

    await this.db
      .update(withholdingPool)
      .set({ refund_used: String(Number(pool.refund_used) + refundAmount) })
      .where(eq(withholdingPool.id, pool.id));

    logger.info({ orderId, refundAmount }, "Withholding used for refund");
    return true;
  }

  /**
   * Get settlement status for an order.
   */
  async getSettlementByOrderId(orderId: string) {
    return this.db
      .select()
      .from(settlementInstructions)
      .where(eq(settlementInstructions.order_id, orderId));
  }

  /**
   * Cross-party settlement reconciliation.
   * Compares collector and receiver settlement records for the same order
   * to detect amount mismatches or other discrepancies.
   */
  async reconcileSettlement(orderId: string): Promise<{
    matched: boolean;
    discrepancies: string[];
  }> {
    const instructions = await this.getSettlementByOrderId(orderId);

    if (instructions.length < 2) {
      return {
        matched: false,
        discrepancies: ["Only one party has created a settlement instruction"],
      };
    }

    const collector = instructions.find(
      (i) => i.collector_subscriber_id === i.signed_by,
    );
    const receiver = instructions.find(
      (i) => i.receiver_subscriber_id === i.signed_by,
    );

    const discrepancies: string[] = [];

    if (collector && receiver) {
      if (collector.amount !== receiver.amount) {
        discrepancies.push(
          `Amount mismatch: ${collector.amount} vs ${receiver.amount}`,
        );
      }
      if (collector.net_payable !== receiver.net_payable) {
        discrepancies.push(
          `Net payable mismatch: ${collector.net_payable} vs ${receiver.net_payable}`,
        );
      }
      if (collector.finder_fee_amount !== receiver.finder_fee_amount) {
        discrepancies.push(
          `Finder fee mismatch: ${collector.finder_fee_amount} vs ${receiver.finder_fee_amount}`,
        );
      }
    } else {
      if (!collector) {
        discrepancies.push("Missing settlement instruction signed by collector");
      }
      if (!receiver) {
        discrepancies.push("Missing settlement instruction signed by receiver");
      }
    }

    const matched = discrepancies.length === 0;
    logger.info(
      { orderId, matched, discrepancyCount: discrepancies.length },
      "Settlement reconciliation completed",
    );
    return { matched, discrepancies };
  }

  /**
   * Register NBBL participant.
   */
  async registerNbblParticipant(registration: {
    subscriberId: string;
    accountNo: string;
    ifsc: string;
    bankName: string;
    vpa?: string;
    settlementAgencyId: string;
  }): Promise<void> {
    // Validate IFSC against RBI database via Razorpay public API
    const ifscResult = await validateIfsc(registration.ifsc);
    if (!ifscResult.valid) {
      throw new Error(`Invalid IFSC: ${ifscResult.error}`);
    }
    // Enrich with verified bank name from RBI database
    registration.bankName = ifscResult.bank?.bank || registration.bankName;

    await this.db
      .insert(nbblRegistrations)
      .values({
        subscriber_id: registration.subscriberId,
        settlement_account_no: registration.accountNo,
        settlement_ifsc: registration.ifsc,
        settlement_bank_name: registration.bankName,
        virtual_payment_address: registration.vpa,
        settlement_agency_id: registration.settlementAgencyId,
        nocs_onboarded: true,
      })
      .onConflictDoUpdate({
        target: nbblRegistrations.subscriber_id,
        set: {
          settlement_account_no: registration.accountNo,
          settlement_ifsc: registration.ifsc,
          settlement_bank_name: registration.bankName,
          virtual_payment_address: registration.vpa,
          settlement_agency_id: registration.settlementAgencyId,
          nocs_onboarded: true,
          updated_at: new Date(),
        },
      });

    logger.info({ subscriberId: registration.subscriberId }, "NBBL participant registered");
  }
}
