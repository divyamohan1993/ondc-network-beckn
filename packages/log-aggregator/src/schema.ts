import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const aggregatedLogs = pgTable(
  "aggregated_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    level: logLevelEnum("level").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_aggregated_logs_service").on(table.service),
    index("idx_aggregated_logs_level").on(table.level),
    index("idx_aggregated_logs_timestamp").on(table.timestamp),
    index("idx_aggregated_logs_service_level").on(table.service, table.level),
    index("idx_aggregated_logs_service_timestamp").on(table.service, table.timestamp),
  ],
);
