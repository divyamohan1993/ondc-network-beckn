import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const simStatusEnum = pgEnum("sim_engine_status", [
  "PENDING",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const simulationEngineRuns = pgTable(
  "simulation_engine_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profile: text("profile").notNull(),
    config: jsonb("config").notNull(),
    status: simStatusEnum("status").default("PENDING").notNull(),
    stats: jsonb("stats"),
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_sim_engine_runs_status").on(table.status),
    index("idx_sim_engine_runs_started_at").on(table.started_at),
  ],
);
