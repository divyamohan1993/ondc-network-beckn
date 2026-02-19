import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run all pending migrations from the `./migrations` folder (relative to this
 * file's compiled output location).
 *
 * Can be invoked directly:
 *   tsx packages/shared/src/db/migrate.ts
 *
 * Or imported and called programmatically.
 */
export async function runMigrations(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  const migrationsFolder = path.resolve(__dirname, "migrations");

  console.log(`Running migrations from ${migrationsFolder} ...`);

  await migrate(db, { migrationsFolder });

  console.log("Migrations completed successfully.");

  await pool.end();
}

// Allow running directly via `tsx migrate.ts`
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isMain) {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://ondc:ondc@localhost:5432/ondc_network";

  runMigrations(connectionString)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
