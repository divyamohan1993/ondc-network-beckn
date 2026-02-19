import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  real,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const serviceStatusEnum = pgEnum("service_status", [
  "UP",
  "DOWN",
  "DEGRADED",
  "UNKNOWN",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "critical",
  "warning",
  "info",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "SERVICE_DOWN",
  "SERVICE_UP",
  "HIGH_RESPONSE_TIME",
  "SERVICE_RESTARTED",
  "PROLONGED_DOWNTIME",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const healthSnapshots = pgTable(
  "health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    status: serviceStatusEnum("status").notNull(),
    response_time: integer("response_time").notNull(),
    status_code: integer("status_code"),
    error: text("error"),
    metadata: jsonb("metadata"),
    checked_at: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_health_snapshots_service").on(table.service),
    index("idx_health_snapshots_checked_at").on(table.checked_at),
    index("idx_health_snapshots_service_checked_at").on(
      table.service,
      table.checked_at,
    ),
  ],
);

export const alerts = pgTable(
  "health_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    type: alertTypeEnum("type").notNull(),
    message: text("message").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    acknowledged: boolean("acknowledged").default(false),
    acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledged_by: text("acknowledged_by"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_health_alerts_service").on(table.service),
    index("idx_health_alerts_created_at").on(table.created_at),
    index("idx_health_alerts_acknowledged").on(table.acknowledged),
  ],
);

export const monitorConfig = pgTable("monitor_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
