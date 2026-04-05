import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

export * from "./schema.js";

/**
 * Create a Drizzle ORM database instance backed by a node-postgres Pool.
 *
 * @param connectionString - PostgreSQL connection string
 *   (e.g. "postgresql://user:pass@localhost:5432/ondc")
 * @returns An object containing the drizzle `db` instance and the underlying
 *   `pool` so callers can manage the connection lifecycle.
 */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: parseInt(process.env["DB_POOL_MAX"] || "20", 10),
    idleTimeoutMillis: parseInt(process.env["DB_POOL_IDLE_TIMEOUT"] || "30000", 10),
    connectionTimeoutMillis: parseInt(process.env["DB_POOL_CONNECTION_TIMEOUT"] || "5000", 10),
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}

export type Database = ReturnType<typeof createDb>["db"];
