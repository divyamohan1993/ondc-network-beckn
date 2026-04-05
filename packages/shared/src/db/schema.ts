import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  numeric,
  unique,
} from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const subscriberTypeEnum = pgEnum("subscriber_type", [
  "BAP",
  "BPP",
  "BG",
]);

export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "INITIATED",
  "UNDER_SUBSCRIPTION",
  "SUBSCRIBED",
  "SUSPENDED",
  "REVOKED",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "SENT",
  "ACK",
  "NACK",
  "CALLBACK_RECEIVED",
  "TIMEOUT",
  "ERROR",
]);

export const adminRoleEnum = pgEnum("admin_role", [
  "SUPER_ADMIN",
  "ADMIN",
  "VIEWER",
]);

export const simulationStatusEnum = pgEnum("simulation_status", [
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriber_id: text("subscriber_id").unique().notNull(),
  subscriber_url: text("subscriber_url").notNull(),
  type: subscriberTypeEnum("type"),
  domain: text("domain"),
  city: text("city"),
  signing_public_key: text("signing_public_key").notNull(),
  encr_public_key: text("encr_public_key"),
  pq_signing_public_key: text("pq_signing_public_key"),
  pq_encryption_public_key: text("pq_encryption_public_key"),
  unique_key_id: text("unique_key_id").notNull(),
  status: subscriberStatusEnum("status").default("INITIATED"),
  valid_from: timestamp("valid_from", { withTimezone: true }),
  valid_until: timestamp("valid_until", { withTimezone: true }),
  webhook_url: text("webhook_url"),
  is_simulated: boolean("is_simulated").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  schema_version: text("schema_version").default("1.1.0"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique().notNull(),
  name: text("name").notNull(),
  state: text("state"),
  is_active: boolean("is_active").default(true),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transaction_id: text("transaction_id").notNull(),
    message_id: text("message_id").notNull(),
    action: text("action").notNull(),
    bap_id: text("bap_id"),
    bpp_id: text("bpp_id"),
    domain: text("domain"),
    city: text("city"),
    request_body: jsonb("request_body"),
    response_body: jsonb("response_body"),
    status: transactionStatusEnum("status").default("SENT"),
    error: jsonb("error"),
    latency_ms: integer("latency_ms"),
    is_simulated: boolean("is_simulated").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_transactions_transaction_id").on(table.transaction_id),
    index("idx_transactions_message_id").on(table.message_id),
    index("idx_transactions_bap_id").on(table.bap_id),
    index("idx_transactions_bpp_id").on(table.bpp_id),
    index("idx_transactions_created_at").on(table.created_at),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resource_type: text("resource_type"),
    resource_id: text("resource_id"),
    details: jsonb("details"),
    ip_address: text("ip_address"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_actor").on(table.actor),
    index("idx_audit_logs_created_at").on(table.created_at),
  ],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: adminRoleEnum("role").default("VIEWER"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  last_login: timestamp("last_login", { withTimezone: true }),
});

export const networkPolicies = pgTable("network_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain"),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const simulationRuns = pgTable("simulation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  config: jsonb("config").notNull(),
  stats: jsonb("stats"),
  status: simulationStatusEnum("status").default("RUNNING"),
});

// ---------------------------------------------------------------------------
// Vault Tables
// ---------------------------------------------------------------------------

export const secretStatusEnum = pgEnum("secret_status", [
  "ACTIVE",
  "ROTATING",
  "REVOKED",
]);

export const vaultSecrets = pgTable("vault_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").unique().notNull(),
  encrypted_value: text("encrypted_value").notNull(),
  previous_encrypted_value: text("previous_encrypted_value"),
  service: text("service").notNull(),
  version: integer("version").notNull().default(1),
  rotation_interval_seconds: integer("rotation_interval_seconds"),
  status: secretStatusEnum("status").default("ACTIVE"),
  last_rotated_at: timestamp("last_rotated_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const vaultTokens = pgTable(
  "vault_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service_id: text("service_id").notNull(),
    token_hash: text("token_hash").notNull(),
    scope: jsonb("scope").notNull(),
    issued_at: timestamp("issued_at", { withTimezone: true }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_vault_tokens_service_id").on(table.service_id),
    index("idx_vault_tokens_expires_at").on(table.expires_at),
  ],
);

export const rotationHooks = pgTable("rotation_hooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  secret_name: text("secret_name").notNull(),
  callback_url: text("callback_url").notNull(),
  headers: jsonb("headers"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Health Monitor Tables
// ---------------------------------------------------------------------------

export const alertSeverityEnum = pgEnum("alert_severity", [
  "INFO",
  "WARNING",
  "CRITICAL",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
]);

export const healthSnapshots = pgTable(
  "health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    status: text("status").notNull(),
    response_time_ms: integer("response_time_ms"),
    details: jsonb("details"),
    checked_at: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_health_snapshots_service").on(table.service),
    index("idx_health_snapshots_checked_at").on(table.checked_at),
  ],
);

export const healthAlerts = pgTable(
  "health_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    status: alertStatusEnum("status").default("OPEN"),
    message: text("message").notNull(),
    details: jsonb("details"),
    acknowledged_by: text("acknowledged_by"),
    acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_health_alerts_service").on(table.service),
    index("idx_health_alerts_status").on(table.status),
    index("idx_health_alerts_created_at").on(table.created_at),
  ],
);

// ---------------------------------------------------------------------------
// Log Aggregator Tables
// ---------------------------------------------------------------------------

export const aggregatedLogs = pgTable(
  "aggregated_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_aggregated_logs_service").on(table.service),
    index("idx_aggregated_logs_level").on(table.level),
    index("idx_aggregated_logs_timestamp").on(table.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Orchestrator Tables
// ---------------------------------------------------------------------------

export const teardownStatusEnum = pgEnum("teardown_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

export const teardownOperations = pgTable("teardown_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  status: teardownStatusEnum("status").default("PENDING"),
  progress: integer("progress").default(0),
  steps_completed: jsonb("steps_completed"),
  error: text("error"),
  initiated_by: text("initiated_by"),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Orders Tables (Order State Machine)
// ---------------------------------------------------------------------------

export const orderStateEnum = pgEnum("order_state", [
  "CREATED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: text("order_id").unique().notNull(),
    transaction_id: text("transaction_id").notNull(),
    bap_id: text("bap_id").notNull(),
    bpp_id: text("bpp_id").notNull(),
    domain: text("domain").notNull(),
    city: text("city").notNull(),
    state: orderStateEnum("state").notNull().default("CREATED"),
    provider: jsonb("provider"),
    items: jsonb("items"),
    billing: jsonb("billing"),
    fulfillments: jsonb("fulfillments"),
    quote: jsonb("quote"),
    payment: jsonb("payment"),
    cancellation_reason_code: text("cancellation_reason_code"),
    cancelled_by: text("cancelled_by"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_orders_order_id").on(table.order_id),
    index("idx_orders_transaction_id").on(table.transaction_id),
    index("idx_orders_bap_id").on(table.bap_id),
    index("idx_orders_bpp_id").on(table.bpp_id),
    index("idx_orders_state").on(table.state),
    index("idx_orders_created_at").on(table.created_at),
  ],
);

export const orderStateTransitions = pgTable(
  "order_state_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.order_id),
    from_state: orderStateEnum("from_state"),
    to_state: orderStateEnum("to_state").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    details: jsonb("details"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_order_state_transitions_order_id").on(table.order_id),
  ],
);

// ---------------------------------------------------------------------------
// Fulfillment State Machine (ONDC v1.2.5)
// ---------------------------------------------------------------------------

export const fulfillmentStateEnum = pgEnum("fulfillment_state", [
  "Pending",
  "Packed",
  "Agent-assigned",
  "Order-picked-up",
  "In-transit",
  "At-destination-hub",
  "Out-for-delivery",
  "Order-delivered",
  "Cancelled",
  "RTO-Initiated",
  "RTO-Delivered",
]);

export const routingTypeEnum = pgEnum("routing_type", ["P2P", "P2H2P"]);

export const fulfillments = pgTable(
  "fulfillments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.order_id),
    fulfillment_id: text("fulfillment_id").notNull(),
    type: text("type").default("Delivery"),
    routing_type: routingTypeEnum("routing_type").default("P2P"),
    state: fulfillmentStateEnum("state").default("Pending"),
    provider_id: text("provider_id"),
    agent_name: text("agent_name"),
    agent_phone: text("agent_phone"),
    vehicle_registration: text("vehicle_registration"),
    tracking_url: text("tracking_url"),
    estimated_delivery: timestamp("estimated_delivery", { withTimezone: true }),
    actual_delivery: timestamp("actual_delivery", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_fulfillments_order_id").on(table.order_id),
    index("idx_fulfillments_state").on(table.state),
    unique("fulfillments_order_id_fulfillment_id").on(
      table.order_id,
      table.fulfillment_id,
    ),
  ],
);

export const fulfillmentStateTransitions = pgTable(
  "fulfillment_state_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fulfillment_id: uuid("fulfillment_id")
      .notNull()
      .references(() => fulfillments.id),
    from_state: fulfillmentStateEnum("from_state"),
    to_state: fulfillmentStateEnum("to_state").notNull(),
    triggered_by: text("triggered_by"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_fst_fulfillment_id").on(table.fulfillment_id),
  ],
);

// ---------------------------------------------------------------------------
// IGM (Issue & Grievance Management) Tables
// ---------------------------------------------------------------------------

export const issueStatusEnum = pgEnum("issue_status", [
  "OPEN",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
]);

export const issueCategoryEnum = pgEnum("issue_category", [
  "ORDER",
  "ITEM",
  "FULFILLMENT",
  "AGENT",
]);

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issue_id: text("issue_id").unique().notNull(),
    transaction_id: text("transaction_id").notNull(),
    order_id: text("order_id"),
    bap_id: text("bap_id").notNull(),
    bpp_id: text("bpp_id").notNull(),
    category: issueCategoryEnum("category").notNull(),
    sub_category: text("sub_category").notNull(),
    status: issueStatusEnum("status").notNull().default("OPEN"),
    short_desc: text("short_desc").notNull(),
    long_desc: text("long_desc"),
    complainant_info: jsonb("complainant_info"),
    respondent_actions: jsonb("respondent_actions").default([]),
    resolution: jsonb("resolution"),
    resolution_provider: jsonb("resolution_provider"),
    expected_response_time: timestamp("expected_response_time", {
      withTimezone: true,
    }),
    expected_resolution_time: timestamp("expected_resolution_time", {
      withTimezone: true,
    }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_issues_issue_id").on(table.issue_id),
    index("idx_issues_transaction_id").on(table.transaction_id),
    index("idx_issues_order_id").on(table.order_id),
    index("idx_issues_status").on(table.status),
    index("idx_issues_created_at").on(table.created_at),
  ],
);

// ---------------------------------------------------------------------------
// RSP (Reconciliation & Settlement) Tables
// ---------------------------------------------------------------------------

export const settlementStatusEnum = pgEnum("settlement_status", [
  "PAID",
  "NOT_PAID",
  "PENDING",
]);

export const reconStatusEnum = pgEnum("recon_status", [
  "01_MATCHED",
  "02_UNMATCHED",
  "03_DISPUTED",
  "04_OVERPAID",
  "05_UNDERPAID",
]);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transaction_id: text("transaction_id").notNull(),
    order_id: text("order_id").notNull(),
    collector_app_id: text("collector_app_id").notNull(),
    receiver_app_id: text("receiver_app_id").notNull(),
    settlement_type: text("settlement_type").notNull(),
    settlement_status: settlementStatusEnum("settlement_status")
      .notNull()
      .default("PENDING"),
    settlement_amount: numeric("settlement_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    settlement_currency: text("settlement_currency").notNull().default("INR"),
    settlement_reference: text("settlement_reference"),
    settlement_timestamp: timestamp("settlement_timestamp", {
      withTimezone: true,
    }),
    buyer_finder_fee_type: text("buyer_finder_fee_type"),
    buyer_finder_fee_amount: numeric("buyer_finder_fee_amount", {
      precision: 12,
      scale: 2,
    }),
    withholding_amount: numeric("withholding_amount", {
      precision: 12,
      scale: 2,
    }),
    settlement_counterparty: text("settlement_counterparty"),
    settlement_phase: text("settlement_phase"),
    settlement_bank_account_no: text("settlement_bank_account_no"),
    settlement_ifsc_code: text("settlement_ifsc_code"),
    upi_address: text("upi_address"),
    recon_status: reconStatusEnum("recon_status"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_settlements_transaction_id").on(table.transaction_id),
    index("idx_settlements_order_id").on(table.order_id),
    index("idx_settlements_settlement_status").on(table.settlement_status),
  ],
);

// ---------------------------------------------------------------------------
// Ratings Tables
// ---------------------------------------------------------------------------

export const ratingCategoryEnum = pgEnum("rating_category", [
  "ORDER",
  "ITEM",
  "FULFILLMENT",
  "AGENT",
  "PROVIDER",
]);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rating_id: text("rating_id").unique().notNull(),
    transaction_id: text("transaction_id").notNull(),
    order_id: text("order_id"),
    bap_id: text("bap_id").notNull(),
    bpp_id: text("bpp_id").notNull(),
    rating_category: ratingCategoryEnum("rating_category").notNull(),
    rated_entity_id: text("rated_entity_id").notNull(),
    value: integer("value").notNull(),
    feedback_form: jsonb("feedback_form"),
    feedback_id: text("feedback_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ratings_transaction_id").on(table.transaction_id),
    index("idx_ratings_order_id").on(table.order_id),
    index("idx_ratings_bpp_id").on(table.bpp_id),
    index("idx_ratings_rated_entity_id").on(table.rated_entity_id),
    index("idx_ratings_rating_category").on(table.rating_category),
  ],
);

// ---------------------------------------------------------------------------
// Multi-Domain Subscriber Support
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RSF 2.0 (NBBL/NOCS Settlement) Tables
// ---------------------------------------------------------------------------

export const settlementBasisEnum = pgEnum("settlement_basis", [
  "collection",
  "shipment",
  "delivery",
  "return_window",
]);

export const nocsTxnStatusEnum = pgEnum("nocs_txn_status", [
  "INITIATED",
  "PENDING",
  "SETTLED",
  "FAILED",
  "DISPUTED",
  "REVERSED",
]);

export const nbblRegistrations = pgTable("nbbl_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriber_id: text("subscriber_id").unique().notNull(),
  settlement_account_no: text("settlement_account_no").notNull(),
  settlement_ifsc: text("settlement_ifsc").notNull(),
  settlement_bank_name: text("settlement_bank_name").notNull(),
  virtual_payment_address: text("virtual_payment_address"),
  nocs_onboarded: boolean("nocs_onboarded").default(false),
  settlement_agency_id: text("settlement_agency_id"),
  registered_at: timestamp("registered_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const settlementInstructions = pgTable(
  "settlement_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: text("order_id").notNull(),
    collector_subscriber_id: text("collector_subscriber_id").notNull(),
    receiver_subscriber_id: text("receiver_subscriber_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").default("INR"),
    settlement_basis: settlementBasisEnum("settlement_basis").notNull(),
    settlement_window_start: timestamp("settlement_window_start", { withTimezone: true }),
    settlement_due_date: timestamp("settlement_due_date", { withTimezone: true }),
    withholding_amount: numeric("withholding_amount", { precision: 12, scale: 2 }).default("0"),
    finder_fee_amount: numeric("finder_fee_amount", { precision: 12, scale: 2 }).default("0"),
    platform_fee_amount: numeric("platform_fee_amount", { precision: 12, scale: 2 }).default("0"),
    net_payable: numeric("net_payable", { precision: 12, scale: 2 }).notNull(),
    status: nocsTxnStatusEnum("status").default("INITIATED"),
    settlement_reference: text("settlement_reference"),
    signature: text("signature"),
    signed_by: text("signed_by"),
    settled_at: timestamp("settled_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_si_order_id").on(table.order_id),
    index("idx_si_collector").on(table.collector_subscriber_id),
    index("idx_si_receiver").on(table.receiver_subscriber_id),
    index("idx_si_status").on(table.status),
    unique("idx_si_order_unique").on(
      table.order_id,
      table.collector_subscriber_id,
      table.receiver_subscriber_id,
    ),
  ],
);

export const withholdingPool = pgTable(
  "withholding_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: text("order_id").notNull(),
    collector_subscriber_id: text("collector_subscriber_id").notNull(),
    withheld_amount: numeric("withheld_amount", { precision: 12, scale: 2 }).notNull(),
    release_date: timestamp("release_date", { withTimezone: true }).notNull(),
    released: boolean("released").default(false).notNull(),
    released_at: timestamp("released_at", { withTimezone: true }),
    refund_used: numeric("refund_used", { precision: 12, scale: 2 }).default("0"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_wp_order_id").on(table.order_id),
    index("idx_wp_release").on(table.release_date),
  ],
);

// ---------------------------------------------------------------------------
// IGM Escalation Timers
// ---------------------------------------------------------------------------

export const escalationTimers = pgTable(
  "escalation_timers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issue_id: text("issue_id").notNull(),
    current_level: integer("current_level").notNull().default(1),
    escalation_deadline: timestamp("escalation_deadline", {
      withTimezone: true,
    }).notNull(),
    escalated: boolean("escalated").default(false),
    escalated_at: timestamp("escalated_at", { withTimezone: true }),
    acknowledged: boolean("acknowledged").default(false),
    acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }),
    resolved: boolean("resolved").default(false),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_et_issue_id").on(table.issue_id),
    index("idx_et_deadline").on(table.escalation_deadline),
  ],
);

// ---------------------------------------------------------------------------
// Logistics Orders (LSP Integration)
// ---------------------------------------------------------------------------

export const logisticsOrders = pgTable(
  "logistics_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retail_order_id: text("retail_order_id")
      .notNull()
      .references(() => orders.order_id),
    logistics_transaction_id: text("logistics_transaction_id").unique().notNull(),
    lsp_subscriber_id: text("lsp_subscriber_id"),
    lsp_provider_id: text("lsp_provider_id"),
    lsp_order_id: text("lsp_order_id"),
    pickup_address: jsonb("pickup_address"),
    delivery_address: jsonb("delivery_address"),
    package_weight: numeric("package_weight", { precision: 10, scale: 3 }),
    package_dimensions: jsonb("package_dimensions"),
    estimated_pickup: timestamp("estimated_pickup", { withTimezone: true }),
    estimated_delivery: timestamp("estimated_delivery", { withTimezone: true }),
    actual_pickup: timestamp("actual_pickup", { withTimezone: true }),
    actual_delivery: timestamp("actual_delivery", { withTimezone: true }),
    tracking_url: text("tracking_url"),
    shipping_label_url: text("shipping_label_url"),
    awb_number: text("awb_number"),
    state: text("state").default("SEARCHING"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_lo_retail_order").on(table.retail_order_id),
    index("idx_lo_lsp_order").on(table.lsp_order_id),
    index("idx_lo_state").on(table.state),
  ],
);

// ---------------------------------------------------------------------------
// Multi-Domain Subscriber Support
// ---------------------------------------------------------------------------

export const subscriberDomains = pgTable(
  "subscriber_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriber_id: text("subscriber_id")
      .notNull()
      .references(() => subscribers.subscriber_id),
    domain: text("domain").notNull(),
    city: text("city"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("subscriber_domains_subscriber_id_domain_city").on(
      table.subscriber_id,
      table.domain,
      table.city,
    ),
    index("idx_subscriber_domains_subscriber_id").on(table.subscriber_id),
    index("idx_subscriber_domains_domain").on(table.domain),
    index("idx_subscriber_domains_domain_city").on(table.domain, table.city),
  ],
);

// ---------------------------------------------------------------------------
// Consent Records (DPDPA 2023 Compliance)
// ---------------------------------------------------------------------------

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    data_principal_id: text("data_principal_id").notNull(),
    subscriber_id: text("subscriber_id").notNull(),
    purpose: text("purpose").notNull(),
    consent_given: boolean("consent_given").notNull(),
    consent_timestamp: timestamp("consent_timestamp", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    ip_address: text("ip_address"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_consent_principal").on(table.data_principal_id),
    index("idx_consent_subscriber").on(table.subscriber_id),
    index("idx_consent_purpose").on(table.data_principal_id, table.purpose),
  ],
);

export type ConsentRecord = InferSelectModel<typeof consentRecords>;

// ---------------------------------------------------------------------------
// Data Erasure Requests (Right to Erasure / DPDPA)
// ---------------------------------------------------------------------------

export const erasureStatusEnum = pgEnum("erasure_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const erasureRequests = pgTable(
  "erasure_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    data_principal_id: text("data_principal_id").notNull(),
    subscriber_id: text("subscriber_id").notNull(),
    reason: text("reason"),
    status: erasureStatusEnum("status").default("PENDING"),
    records_anonymized: integer("records_anonymized").default(0),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_erasure_principal").on(table.data_principal_id),
    index("idx_erasure_status").on(table.status),
  ],
);

export type ErasureRequest = InferSelectModel<typeof erasureRequests>;

// ---------------------------------------------------------------------------
// Indian Law Compliance Tables
// ---------------------------------------------------------------------------

// Data Breach Reports (DPDPA Section 12 + CERT-In)
export const dataBreachReports = pgTable("data_breach_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  detected_at: timestamp("detected_at", { withTimezone: true }).notNull(),
  notified_cert_in_at: timestamp("notified_cert_in_at", { withTimezone: true }),
  notified_principals_at: timestamp("notified_principals_at", {
    withTimezone: true,
  }),
  description: text("description").notNull(),
  affected_records: integer("affected_records").default(0),
  data_categories: text("data_categories").array(),
  remedial_actions: text("remedial_actions").array(),
  status: text("status").default("DETECTED"),
  cert_in_report_id: text("cert_in_report_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type DataBreachReport = InferSelectModel<typeof dataBreachReports>;

// Security Incidents (IT Act 2000 / CERT-In Directions 2022)
export const securityIncidents = pgTable("security_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  severity: text("severity").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  detected_at: timestamp("detected_at", { withTimezone: true }).notNull(),
  reported_at: timestamp("reported_at", { withTimezone: true }),
  cert_in_report_id: text("cert_in_report_id"),
  affected_systems: text("affected_systems").array(),
  remediation: text("remediation").array(),
  status: text("status").default("DETECTED"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SecurityIncident = InferSelectModel<typeof securityIncidents>;

// Data Principal Rights Requests (DPDPA Section 8)
export const dataPrincipalRequests = pgTable(
  "data_principal_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    principal_id: text("principal_id").notNull(),
    request_type: text("request_type").notNull(),
    details: text("details"),
    requested_at: timestamp("requested_at", { withTimezone: true }).defaultNow(),
    responded_at: timestamp("responded_at", { withTimezone: true }),
    response_deadline: timestamp("response_deadline", {
      withTimezone: true,
    }).notNull(),
    status: text("status").default("PENDING"),
    response: text("response"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_dpr_principal").on(table.principal_id),
    index("idx_dpr_status").on(table.status),
    index("idx_dpr_deadline").on(table.response_deadline),
  ],
);

export type DataPrincipalRequest = InferSelectModel<typeof dataPrincipalRequests>;
