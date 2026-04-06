/**
 * Seed India Post pincode database from data.gov.in API.
 *
 * Usage:
 *   DATABASE_URL=... DATAGOVIN=... pnpm seed:pincodes
 */
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { AddressService } from "../../packages/shared/src/services/address-service.js";
import { createLogger } from "../../packages/shared/src/utils/logger.js";

const logger = createLogger("seed-pincodes");

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const DATAGOVIN = process.env.DATAGOVIN;

  if (!DATABASE_URL) {
    logger.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  if (!DATAGOVIN) {
    logger.error("DATAGOVIN environment variable is required (data.gov.in API key)");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  const addressService = new AddressService(db as any);

  try {
    const count = await addressService.fetchAndSeedFromDataGovIn(DATAGOVIN);
    logger.info({ count }, "Pincode seeding complete");
  } catch (err) {
    logger.error({ err }, "Pincode seeding failed");
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
