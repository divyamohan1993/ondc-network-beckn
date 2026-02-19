import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// vault_secrets - Encrypted secrets storage
// ---------------------------------------------------------------------------

export const vaultSecrets = pgTable(
  "vault_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").unique().notNull(),
    encrypted_value: text("encrypted_value").notNull(),
    previous_encrypted_value: text("previous_encrypted_value"),
    service: text("service").notNull(),
    version: integer("version").default(1).notNull(),
    rotation_interval_seconds: integer("rotation_interval_seconds"),
    last_rotated_at: timestamp("last_rotated_at", { withTimezone: true }),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_vault_secrets_name").on(table.name),
    index("idx_vault_secrets_service").on(table.service),
  ],
);

// ---------------------------------------------------------------------------
// vault_tokens - Access token metadata (hash stored, not raw token)
// ---------------------------------------------------------------------------

export const vaultTokens = pgTable(
  "vault_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service_id: text("service_id").notNull(),
    token_hash: text("token_hash").notNull(),
    scope: jsonb("scope").$type<string[]>().notNull(),
    issued_at: timestamp("issued_at", { withTimezone: true }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_vault_tokens_service_id").on(table.service_id),
    index("idx_vault_tokens_token_hash").on(table.token_hash),
  ],
);

// ---------------------------------------------------------------------------
// rotation_hooks - HTTP callbacks triggered on secret rotation
// ---------------------------------------------------------------------------

export const rotationHooks = pgTable(
  "rotation_hooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secret_name: text("secret_name").notNull(),
    callback_url: text("callback_url").notNull(),
    headers: jsonb("headers").$type<Record<string, string>>(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_rotation_hooks_secret_name").on(table.secret_name),
  ],
);

// ---------------------------------------------------------------------------
// Type exports for convenience
// ---------------------------------------------------------------------------

export type VaultSecret = typeof vaultSecrets.$inferSelect;
export type NewVaultSecret = typeof vaultSecrets.$inferInsert;

export type VaultToken = typeof vaultTokens.$inferSelect;
export type NewVaultToken = typeof vaultTokens.$inferInsert;

export type RotationHook = typeof rotationHooks.$inferSelect;
export type NewRotationHook = typeof rotationHooks.$inferInsert;
