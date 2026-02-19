// ---------------------------------------------------------------------------
// RSP (Reconciliation & Settlement Protocol) Types
// ---------------------------------------------------------------------------
// Ref: ONDC RSP specification for payment reconciliation and settlement
// ---------------------------------------------------------------------------

import type { BecknContext, Tag } from "./types.js";

// ---------------------------------------------------------------------------
// Settlement Enums
// ---------------------------------------------------------------------------

/**
 * Supported settlement transfer types.
 */
export enum SettlementType {
  NEFT = "neft",
  RTGS = "rtgs",
  UPI = "upi",
  CREDIT = "credit",
  DEBIT = "debit",
  WALLET = "wallet",
}

/**
 * Settlement payment status.
 */
export enum SettlementStatus {
  PAID = "PAID",
  NOT_PAID = "NOT-PAID",
  PENDING = "PENDING",
}

/**
 * Entity responsible for collecting payment from the buyer.
 */
export enum CollectorType {
  BAP = "BAP",
  BPP = "BPP",
}

// ---------------------------------------------------------------------------
// Reconciliation Enums
// ---------------------------------------------------------------------------

/**
 * Reconciliation status codes.
 *
 *   01 - Matched
 *   02 - Unmatched
 *   03 - Disputed
 */
export enum ReconStatus {
  MATCHED = "01",
  UNMATCHED = "02",
  DISPUTED = "03",
}

/**
 * RSP request actions.
 */
export enum RspAction {
  receiver_recon = "receiver_recon",
  collector_recon = "collector_recon",
}

/**
 * RSP callback actions.
 */
export enum RspCallbackAction {
  on_receiver_recon = "on_receiver_recon",
  on_collector_recon = "on_collector_recon",
}

// ---------------------------------------------------------------------------
// Settlement Detail Types
// ---------------------------------------------------------------------------

/**
 * Bank account details for settlement.
 */
export interface SettlementBankDetails {
  settlement_bank_account_no?: string;
  settlement_ifsc_code?: string;
  bank_name?: string;
  branch_name?: string;
  beneficiary_name?: string;
  beneficiary_address?: string;
}

/**
 * Full settlement details for a transaction.
 */
export interface SettlementDetails {
  settlement_counterparty?: string;
  settlement_phase?: string;
  settlement_type?: SettlementType | string;
  settlement_amount?: string;
  settlement_timestamp?: string;
  settlement_reference?: string;
  settlement_status?: SettlementStatus | string;
  upi_address?: string;
  bank_details?: SettlementBankDetails;
}

// ---------------------------------------------------------------------------
// Order-level Reconciliation Types
// ---------------------------------------------------------------------------

/**
 * A single order recon entry used in both receiver and collector recon flows.
 */
export interface OrderReconEntry {
  /** ONDC order ID. */
  id: string;
  /** Invoice number / reference. */
  invoice_no?: string;
  /** Collector application subscriber ID. */
  collector_app_id?: string;
  /** Receiver application subscriber ID. */
  receiver_app_id?: string;
  /** State of the order at recon time. */
  state?: string;
  /** Transaction-level amounts and settlement info. */
  provider?: {
    id?: string;
    name?: string;
  };
  payment?: {
    uri?: string;
    tl_method?: string;
    params?: {
      transaction_id?: string;
      transaction_status?: string;
      amount?: string;
      currency?: string;
      [key: string]: string | undefined;
    };
    type?: string;
    status?: string;
    collected_by?: CollectorType | string;
    "@ondc/org/buyer_app_finder_fee_type"?: string;
    "@ondc/org/buyer_app_finder_fee_amount"?: string;
    "@ondc/org/settlement_details"?: SettlementDetails[];
  };
  /** Withholding tax amount. */
  withholding_tax_gst?: {
    currency?: string;
    value?: string;
  };
  /** Withholding tax amount (TDS). */
  withholding_tax_tds?: {
    currency?: string;
    value?: string;
  };
  /** Deduction by collector. */
  deduction_by_collector?: {
    currency?: string;
    value?: string;
  };
  /** Net payable amount after deductions. */
  payerdetails?: {
    payer_name?: string;
    payer_address?: string;
    payer_account_no?: string;
    payer_bank_code?: string;
    payer_virtual_payment_address?: string;
  };
  /** Recon settlement details. */
  settlement_reason_code?: string;
  /** Recon matching status for this order. */
  recon_status?: ReconStatus | string;
  /** Difference amount (if unmatched or disputed). */
  diff_amount?: {
    currency?: string;
    value?: string;
  };
  /** Counter-party recon status. */
  counterparty_recon_status?: ReconStatus | string;
  /** Free-text message for recon mismatch. */
  message?: {
    name?: string;
    code?: string;
  };
  created_at?: string;
  updated_at?: string;
  tags?: Tag[];
}

// ---------------------------------------------------------------------------
// Request / Response Payloads
// ---------------------------------------------------------------------------

/**
 * Payload for `receiver_recon` action.
 *
 * Sent by the receiver (seller-side NP) to initiate reconciliation.
 */
export interface ReceiverReconRequest {
  context: BecknContext;
  message: {
    orderbook: {
      orders: OrderReconEntry[];
    };
  };
}

/**
 * Payload for `on_receiver_recon` callback.
 *
 * Sent by the collector (buyer-side NP) in response to receiver recon.
 */
export interface OnReceiverReconRequest {
  context: BecknContext;
  message: {
    orderbook: {
      orders: OrderReconEntry[];
    };
  };
}

/**
 * Payload for `collector_recon` action.
 *
 * Sent by the collector (buyer-side NP) to initiate reconciliation.
 */
export interface CollectorReconRequest {
  context: BecknContext;
  message: {
    orderbook: {
      orders: OrderReconEntry[];
    };
  };
}

/**
 * Payload for `on_collector_recon` callback.
 *
 * Sent by the receiver (seller-side NP) in response to collector recon.
 */
export interface OnCollectorReconRequest {
  context: BecknContext;
  message: {
    orderbook: {
      orders: OrderReconEntry[];
    };
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Check if a string is a valid `ReconStatus` code.
 *
 * @param value - The string to check ("01", "02", or "03").
 * @returns `true` if it is a known recon status.
 */
export function isValidReconStatus(value: string): value is ReconStatus {
  return (
    value === ReconStatus.MATCHED ||
    value === ReconStatus.UNMATCHED ||
    value === ReconStatus.DISPUTED
  );
}

/**
 * Get a human-readable label for a recon status code.
 *
 * @param status - A `ReconStatus` value.
 * @returns Descriptive label string.
 */
export function getReconStatusLabel(status: ReconStatus): string {
  switch (status) {
    case ReconStatus.MATCHED:
      return "Matched";
    case ReconStatus.UNMATCHED:
      return "Unmatched";
    case ReconStatus.DISPUTED:
      return "Disputed";
  }
}

/**
 * Check if a string is a valid `SettlementType`.
 *
 * @param value - The string to check.
 * @returns `true` if it is a known settlement type.
 */
export function isValidSettlementType(value: string): value is SettlementType {
  return Object.values(SettlementType).includes(value as SettlementType);
}

/**
 * Check if a string is a valid `SettlementStatus`.
 *
 * @param value - The string to check.
 * @returns `true` if it is a known settlement status.
 */
export function isValidSettlementStatus(value: string): value is SettlementStatus {
  return Object.values(SettlementStatus).includes(value as SettlementStatus);
}
