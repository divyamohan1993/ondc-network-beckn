import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logger = createLogger("db-migrate");

/**
 * Run all pending migrations from the `./migrations` folder (relative to this
 * file's compiled output location).
 *
 * Can be invoked directly:
 *   tsx packages/shared/src/db/migrate.ts
 *
 * Or imported and called programmatically.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  const migrationsFolder = path.resolve(__dirname, "migrations");

  logger.info({ migrationsFolder }, "Running database migrations...");

  await migrate(db, { migrationsFolder });

  logger.info("Database migrations completed successfully");

  await pool.end();
}

// Allow running directly via `tsx migrate.ts`
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isMain) {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    logger.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  runMigrations(connectionString)
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Migration failed");
      process.exit(1);
    });
}
