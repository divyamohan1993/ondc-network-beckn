import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema.js";

/**
 * Vault-specific database type that includes vault schema tables.
 * This augments the shared Database type with vault-specific schema.
 */
export type Database = ReturnType<typeof drizzle<typeof schema>>;
