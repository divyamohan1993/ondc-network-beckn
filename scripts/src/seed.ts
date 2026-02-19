import "dotenv/config";
import { createDb, subscribers, domains, cities, adminUsers } from "@ondc/shared/db";
import bcrypt from "bcrypt";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// ed25519 v2 requires providing a sha-512 implementation
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://ondc:ondc@localhost:5432/ondc_network";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ondc-network.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "ONDC Admin";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DOMAINS = [
  {
    code: "ONDC:NIC2004:49299",
    name: "Water Delivery",
    description: "Packaged drinking water and tanker delivery",
  },
  {
    code: "ONDC:RET10",
    name: "Food & Grocery",
    description: "Food delivery and grocery",
  },
  {
    code: "ONDC:AGR10",
    name: "Agriculture",
    description: "Agricultural products, seeds, fertilizers",
  },
  {
    code: "ONDC:LOG10",
    name: "Logistics",
    description: "Courier, warehousing, fleet",
  },
  {
    code: "ONDC:HLT10",
    name: "Healthcare",
    description: "Medicines, lab tests, consultations",
  },
  {
    code: "ONDC:RET12",
    name: "Retail",
    description: "Electronics, clothing, home goods",
  },
];

const CITIES = [
  { code: "std:011", name: "Delhi", state: "Delhi" },
  { code: "std:080", name: "Bangalore", state: "Karnataka" },
  { code: "std:022", name: "Mumbai", state: "Maharashtra" },
  { code: "std:044", name: "Chennai", state: "Tamil Nadu" },
  { code: "std:033", name: "Kolkata", state: "West Bengal" },
  { code: "std:040", name: "Hyderabad", state: "Telangana" },
  { code: "std:020", name: "Pune", state: "Maharashtra" },
  { code: "std:079", name: "Ahmedabad", state: "Gujarat" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateKeyPairBase64() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    signingPublicKey: Buffer.from(publicKey).toString("base64"),
    signingPrivateKey: Buffer.from(privateKey).toString("base64"),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Connecting to database...");
  const { db, pool } = createDb(DATABASE_URL);

  try {
    // --- Admin user ---------------------------------------------------------
    console.log("Seeding admin user...");
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db
      .insert(adminUsers)
      .values({
        email: ADMIN_EMAIL,
        password_hash: passwordHash,
        name: ADMIN_NAME,
        role: "SUPER_ADMIN",
        is_active: true,
      })
      .onConflictDoNothing({ target: adminUsers.email });

    console.log(`  Admin user: ${ADMIN_EMAIL}`);

    // --- Domains ------------------------------------------------------------
    console.log("Seeding domains...");
    for (const d of DOMAINS) {
      await db
        .insert(domains)
        .values(d)
        .onConflictDoNothing({ target: domains.code });
      console.log(`  Domain: ${d.code} (${d.name})`);
    }

    // --- Cities -------------------------------------------------------------
    console.log("Seeding cities...");
    for (const c of CITIES) {
      await db
        .insert(cities)
        .values(c)
        .onConflictDoNothing({ target: cities.code });
      console.log(`  City: ${c.code} (${c.name})`);
    }

    // --- Registry & Gateway (network participants) --------------------------
    console.log("Seeding network participants...");

    const registryKeys = await generateKeyPairBase64();
    await db
      .insert(subscribers)
      .values({
        subscriber_id: "registry.ondc-network.local",
        subscriber_url: "http://localhost:3001",
        type: "BG",
        signing_public_key: registryKeys.signingPublicKey,
        unique_key_id: "registry-key-01",
        status: "SUBSCRIBED",
        valid_from: new Date(),
        valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing({ target: subscribers.subscriber_id });

    console.log("  Registry: registry.ondc-network.local (SUBSCRIBED)");

    const gatewayKeys = await generateKeyPairBase64();
    await db
      .insert(subscribers)
      .values({
        subscriber_id: "gateway.ondc-network.local",
        subscriber_url: "http://localhost:3002",
        type: "BG",
        signing_public_key: gatewayKeys.signingPublicKey,
        unique_key_id: "gateway-key-01",
        status: "SUBSCRIBED",
        valid_from: new Date(),
        valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing({ target: subscribers.subscriber_id });

    console.log("  Gateway: gateway.ondc-network.local (SUBSCRIBED)");

    console.log("\nSeed completed successfully.");
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
