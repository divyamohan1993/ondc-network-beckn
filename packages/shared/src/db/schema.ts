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
  version: integer("version").default(1),
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
