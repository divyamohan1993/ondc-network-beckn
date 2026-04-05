/**
 * RSF 2.0 (Reconciliation and Settlement Framework) types
 * For integration with NBBL NOCS platform.
 */

export enum SettlementBasis {
  Collection = "collection",
  Shipment = "shipment",
  Delivery = "delivery",
  ReturnWindow = "return_window",
}

export enum SettlementPhase {
  CollectorSettlement = "collector_settlement",
  ReceiverSettlement = "receiver_settlement",
  NetSettlement = "net_settlement",
}

export enum NocsTxnStatus {
  Initiated = "INITIATED",
  Pending = "PENDING",
  Settled = "SETTLED",
  Failed = "FAILED",
  Disputed = "DISPUTED",
  Reversed = "REVERSED",
}

export interface SettlementTerms {
  settlement_basis: SettlementBasis;
  settlement_window: string;
  withholding_amount_percent: number;
  return_window: string;
  mandate_id?: string;
}

export interface NbblRegistration {
  participant_id: string;
  subscriber_id: string;
  settlement_account_no: string;
  settlement_ifsc: string;
  settlement_bank_name: string;
  virtual_payment_address?: string;
  nocs_onboarded: boolean;
  settlement_agency_id: string;
  registered_at: string;
}

export interface SettlementInstruction {
  id: string;
  order_id: string;
  collector_subscriber_id: string;
  receiver_subscriber_id: string;
  amount: number;
  currency: string;
  settlement_basis: SettlementBasis;
  settlement_window_start: string;
  settlement_due_date: string;
  withholding_amount: number;
  finder_fee_amount: number;
  platform_fee_amount: number;
  net_payable: number;
  status: NocsTxnStatus;
  settlement_reference?: string;
  settled_at?: string;
}

export interface WithholdingPool {
  order_id: string;
  collector_subscriber_id: string;
  withheld_amount: number;
  release_date: string;
  released: boolean;
  released_at?: string;
  refund_used: number;
}

export interface ReconciliationReport {
  period_start: string;
  period_end: string;
  total_orders: number;
  total_settled: number;
  total_pending: number;
  total_disputed: number;
  gross_transaction_value: number;
  total_finder_fees: number;
  total_platform_fees: number;
  net_settlement_amount: number;
  entries: SettlementInstruction[];
}

export interface NocsWebhookPayload {
  event: string;
  order_id: string;
  status: NocsTxnStatus;
  settlement_reference?: string;
  amount?: number;
  currency?: string;
  timestamp: string;
}
