import "dotenv/config";
import { Command } from "commander";
import { randomUUID, randomBytes } from "node:crypto";
import { request as httpRequest } from "undici";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  createDb,
  subscribers,
  transactions,
  simulationRuns,
} from "@ondc/shared/db";
import { buildContext } from "@ondc/shared/protocol";
import { eq } from "drizzle-orm";

// ed25519 v2 requires providing a sha-512 implementation
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://ondc:ondc@localhost:5432/ondc_network";

const REGISTRY_URL = process.env["REGISTRY_URL"] ?? "http://localhost:3001";
const MOCK_SERVER_URL = process.env["MOCK_SERVER_URL"] ?? "http://localhost:3010";
const BAP_ADAPTER_URL = process.env["BAP_ADAPTER_URL"] ?? "http://localhost:3003";
const BPP_ADAPTER_URL = process.env["BPP_ADAPTER_URL"] ?? "http://localhost:3005";

// ---------------------------------------------------------------------------
// Domain and city mappings
// ---------------------------------------------------------------------------

const DOMAIN_MAP: Record<string, string> = {
  water: "ONDC:NIC2004:49299",
  food: "ONDC:RET10",
  agriculture: "ONDC:AGR10",
  logistics: "ONDC:LOG10",
};

const CITY_CODES = [
  "std:011",
  "std:080",
  "std:022",
  "std:044",
  "std:033",
  "std:040",
  "std:020",
  "std:079",
];

const BAP_NAMES = [
  "BuyerApp OneStop",
  "ShopEasy Platform",
  "OrderKaro App",
  "BazaarNow",
  "DailyNeeds Hub",
  "QuickBuy India",
  "MeraBazaar App",
  "KhareediKaro",
  "SwiftOrder Platform",
  "NearbyShop App",
  "UrbanCart",
  "ApnaOrder",
  "CityShop Express",
  "ClickBuy India",
  "LocalMart App",
];

const BPP_NAMES: Record<string, string[]> = {
  water: [
    "AquaPure Delhi", "BlueWater Tankers", "JalMitra Services", "CrystalDrop Water",
    "HydroFresh Supply", "PureFlow Water Co", "Aqua Express", "JalSeva Plus",
    "ClearWater Solutions", "Paani Junction", "NeerJal Services", "TankerWala",
  ],
  food: [
    "Spice Kitchen", "Tandoori Nights", "Green Bowl Cafe", "Biryani House",
    "Dosa Corner", "Mumbai Tiffins", "Punjab Dhaba", "Royal Feast",
    "Street Bites Express", "Curry Leaf Kitchen", "Roti Factory", "Thali Express",
  ],
  agriculture: [
    "KisanMandi", "AgriGold Seeds", "FarmFresh Direct", "GreenHarvest",
    "KhetiBari Store", "Seed Master India", "AgriTech Solutions", "Krishi Kendra",
    "Fasal Bazaar", "Mitti Organic", "KisanSeva Hub",
  ],
  logistics: [
    "SpeedShip Couriers", "TransIndia Logistics", "QuickMove Express", "SafeDeliver",
    "CargoExpress India", "FleetMaster", "Delhivery Plus", "BlueDart Local",
    "PacketRun", "ShipKaro Express",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a realistic timestamp distributed throughout the day.
 * More orders happen between 10am-2pm and 6pm-10pm (IST).
 */
function generateRealisticTimestamp(baseDate: Date): Date {
  const date = new Date(baseDate);
  const rand = Math.random();
  let hour: number;

  if (rand < 0.05) {
    // 5% chance: 12am - 6am (late night / early morning)
    hour = Math.floor(Math.random() * 6);
  } else if (rand < 0.15) {
    // 10% chance: 6am - 10am (morning)
    hour = 6 + Math.floor(Math.random() * 4);
  } else if (rand < 0.50) {
    // 35% chance: 10am - 2pm (lunch rush)
    hour = 10 + Math.floor(Math.random() * 4);
  } else if (rand < 0.65) {
    // 15% chance: 2pm - 6pm (afternoon)
    hour = 14 + Math.floor(Math.random() * 4);
  } else if (rand < 0.90) {
    // 25% chance: 6pm - 10pm (dinner rush)
    hour = 18 + Math.floor(Math.random() * 4);
  } else {
    // 10% chance: 10pm - 12am (late evening)
    hour = 22 + Math.floor(Math.random() * 2);
  }

  date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return date;
}

async function generateKeyPair() {
  const signingPrivateKeyBytes = ed.utils.randomPrivateKey();
  const signingPublicKeyBytes = await ed.getPublicKeyAsync(signingPrivateKeyBytes);

  const encrPrivateKeyBytes = ed25519.utils.toMontgomerySecret(signingPrivateKeyBytes);
  const encrPublicKeyBytes = ed25519.utils.toMontgomery(signingPublicKeyBytes);

  return {
    signingPrivateKey: Buffer.from(signingPrivateKeyBytes).toString("base64"),
    signingPublicKey: Buffer.from(signingPublicKeyBytes).toString("base64"),
    encrPrivateKey: Buffer.from(encrPrivateKeyBytes).toString("base64"),
    encrPublicKey: Buffer.from(encrPublicKeyBytes).toString("base64"),
  };
}

async function httpPost(url: string, body: object): Promise<{ statusCode: number; data: unknown }> {
  try {
    const { statusCode, body: resBody } = await httpRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resBody.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: { error: String(err) } };
  }
}

// ---------------------------------------------------------------------------
// Subscriber generation
// ---------------------------------------------------------------------------

interface SimulatedSubscriber {
  subscriberId: string;
  subscriberUrl: string;
  type: "BAP" | "BPP";
  domain: string;
  city: string;
  signingPublicKey: string;
  signingPrivateKey: string;
  encrPublicKey: string;
  encrPrivateKey: string;
  uniqueKeyId: string;
  webhookUrl: string;
  name: string;
}

async function registerSubscriber(
  subscriber: SimulatedSubscriber,
  db: ReturnType<typeof createDb>["db"],
): Promise<boolean> {
  const uniqueKeyId = subscriber.uniqueKeyId;

  // Step 1: Register with the registry via /subscribe
  console.log(`    Registering ${subscriber.type} ${subscriber.name} (${subscriber.subscriberId})...`);

  const subscribePayload = {
    subscriber_id: subscriber.subscriberId,
    subscriber_url: subscriber.subscriberUrl,
    type: subscriber.type,
    domain: subscriber.domain,
    city: subscriber.city,
    country: "IND",
    signing_public_key: subscriber.signingPublicKey,
    encr_public_key: subscriber.encrPublicKey,
    unique_key_id: uniqueKeyId,
  };

  const { statusCode, data } = await httpPost(`${REGISTRY_URL}/subscribe`, subscribePayload);

  if (statusCode === 200) {
    console.log(`    Registry /subscribe responded with 200`);

    // Step 2: Attempt challenge-response via /on_subscribe
    // The registry may return an encrypted challenge; try to decrypt and respond
    const responseData = data as Record<string, unknown> | null;
    if (responseData && typeof responseData === "object" && "challenge" in responseData) {
      const challenge = responseData["challenge"] as string;
      console.log(`    Received challenge, attempting decryption...`);

      try {
        // Import decrypt from shared crypto
        const { decrypt } = await import("@ondc/shared/crypto");
        const decryptedChallenge = decrypt(challenge, subscriber.encrPrivateKey, "");

        const onSubscribePayload = {
          subscriber_id: subscriber.subscriberId,
          challenge: decryptedChallenge,
        };

        const { statusCode: osStatus } = await httpPost(
          `${REGISTRY_URL}/on_subscribe`,
          onSubscribePayload,
        );

        console.log(`    /on_subscribe responded with ${osStatus}`);
      } catch (err) {
        console.log(`    Challenge decryption failed (non-critical): ${err}`);
      }
    }
  } else {
    console.log(`    Registry /subscribe responded with ${statusCode} (non-critical, inserting directly)`);
  }

  // Step 3: Ensure the subscriber record exists in DB with is_simulated = true
  try {
    await db
      .insert(subscribers)
      .values({
        subscriber_id: subscriber.subscriberId,
        subscriber_url: subscriber.subscriberUrl,
        type: subscriber.type,
        domain: subscriber.domain,
        city: subscriber.city,
        signing_public_key: subscriber.signingPublicKey,
        encr_public_key: subscriber.encrPublicKey,
        unique_key_id: uniqueKeyId,
        status: "SUBSCRIBED",
        webhook_url: subscriber.webhookUrl,
        is_simulated: true,
        valid_from: new Date(),
        valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing({ target: subscribers.subscriber_id });

    console.log(`    DB record ensured for ${subscriber.subscriberId}`);
    return true;
  } catch (err) {
    console.error(`    Failed to insert subscriber: ${err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Order simulation
// ---------------------------------------------------------------------------

async function simulateOrder(
  bap: SimulatedSubscriber,
  bpps: SimulatedSubscriber[],
  domainFilter: string[],
  cityFilter: string[],
  orderIndex: number,
  db: ReturnType<typeof createDb>["db"],
  timestamp: Date,
): Promise<boolean> {
  // Pick a domain and matching BPP
  const availableDomains = domainFilter.length > 0 ? domainFilter : Object.values(DOMAIN_MAP);
  const domain = pickRandom(availableDomains);

  // Find a BPP that serves this domain
  const matchingBpps = bpps.filter((b) => b.domain === domain);
  if (matchingBpps.length === 0) {
    console.log(`  Order #${orderIndex}: No BPP found for domain ${domain}, skipping`);
    return false;
  }

  const bpp = pickRandom(matchingBpps);
  const availableCities = cityFilter.length > 0 ? cityFilter : CITY_CODES;
  const city = pickRandom(availableCities);

  const transactionId = randomUUID();
  const ts = timestamp.toISOString();

  console.log(
    `  Order #${orderIndex}: ${bap.name} -> ${bpp.name} | domain=${domain} city=${city} txn=${transactionId.slice(0, 8)}...`,
  );

  // Step 1: search
  const searchContext = buildContext({
    domain,
    city,
    action: "search",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const searchRequest = {
    context: searchContext,
    message: {
      intent: {
        descriptor: { name: "" },
        fulfillment: {
          type: "Delivery",
          end: {
            location: {
              gps: "28.6139,77.2090",
            },
          },
        },
      },
    },
  };

  // Send search to mock-server BPP endpoint
  const { statusCode: searchStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/search`,
    searchRequest,
  );

  // Log the search transaction
  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: searchContext.message_id,
      action: "search",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: searchRequest,
      status: searchStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Transaction logging is non-critical
  }

  if (searchStatus !== 200) {
    console.log(`    search failed (${searchStatus})`);
    return false;
  }

  // Brief delay between steps
  await sleep(50);

  // Step 2: select
  const selectContext = buildContext({
    domain,
    city,
    action: "select",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const selectRequest = {
    context: selectContext,
    message: {
      order: {
        provider: {
          id: `provider-${randomUUID().slice(0, 8)}`,
        },
        items: [
          {
            id: `item-${Math.floor(Math.random() * 30) + 1}`.padStart(7, "0"),
            quantity: { count: Math.floor(Math.random() * 3) + 1 },
            fulfillment_id: "delivery-standard",
          },
        ],
      },
    },
  };

  const { statusCode: selectStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/select`,
    selectRequest,
  );

  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: selectContext.message_id,
      action: "select",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: selectRequest,
      status: selectStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Non-critical
  }

  await sleep(50);

  // Step 3: init
  const initContext = buildContext({
    domain,
    city,
    action: "init",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const initRequest = {
    context: initContext,
    message: {
      order: {
        provider: selectRequest.message.order.provider,
        items: selectRequest.message.order.items,
        billing: {
          name: pickRandom([
            "Rahul Sharma", "Priya Patel", "Amit Kumar", "Neha Singh",
            "Suresh Reddy", "Anita Gupta", "Raj Malhotra", "Kavita Nair",
          ]),
          phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          email: "buyer@example.com",
          address: {
            city: city,
            country: "IND",
            area_code: `${Math.floor(100000 + Math.random() * 900000)}`,
          },
        },
        fulfillments: [
          {
            id: "fulfillment-001",
            type: "Delivery",
            end: {
              location: {
                gps: "28.6139,77.2090",
                address: {
                  locality: "Test Locality",
                  city: "Test City",
                  area_code: "110001",
                  country: "IND",
                },
              },
              contact: {
                phone: "9876543210",
              },
              person: {
                name: "Test Buyer",
              },
            },
          },
        ],
      },
    },
  };

  const { statusCode: initStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/init`,
    initRequest,
  );

  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: initContext.message_id,
      action: "init",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: initRequest,
      status: initStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Non-critical
  }

  await sleep(50);

  // Step 4: confirm
  const confirmContext = buildContext({
    domain,
    city,
    action: "confirm",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const paymentType = Math.random() > 0.4 ? "ON-ORDER" : "ON-FULFILLMENT";

  const confirmRequest = {
    context: confirmContext,
    message: {
      order: {
        provider: selectRequest.message.order.provider,
        items: selectRequest.message.order.items,
        billing: initRequest.message.order.billing,
        fulfillments: initRequest.message.order.fulfillments,
        payment: {
          type: paymentType,
          status: paymentType === "ON-ORDER" ? "PAID" : "NOT-PAID",
          collected_by: paymentType === "ON-ORDER" ? "BAP" : "BPP",
          params:
            paymentType === "ON-ORDER"
              ? {
                  transaction_id: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                  transaction_status: "payment-collected",
                  amount: String(Math.floor(Math.random() * 5000) + 100),
                  currency: "INR",
                }
              : undefined,
        },
      },
    },
  };

  const { statusCode: confirmStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/confirm`,
    confirmRequest,
  );

  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: confirmContext.message_id,
      action: "confirm",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: confirmRequest,
      status: confirmStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Non-critical
  }

  await sleep(50);

  // Step 5: status
  const statusContext = buildContext({
    domain,
    city,
    action: "status",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const statusRequest = {
    context: statusContext,
    message: {
      order: {
        id: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
      },
    },
  };

  const { statusCode: statusStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/status`,
    statusRequest,
  );

  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: statusContext.message_id,
      action: "status",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: statusRequest,
      status: statusStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Non-critical
  }

  await sleep(30);

  // Step 6: track
  const trackContext = buildContext({
    domain,
    city,
    action: "track",
    bap_id: bap.subscriberId,
    bap_uri: bap.webhookUrl,
    bpp_id: bpp.subscriberId,
    bpp_uri: bpp.webhookUrl,
    transaction_id: transactionId,
    timestamp: ts,
  });

  const trackRequest = {
    context: trackContext,
    message: {
      order: {
        id: statusRequest.message.order.id,
      },
    },
  };

  const { statusCode: trackStatus } = await httpPost(
    `${MOCK_SERVER_URL}/bpp/action/track`,
    trackRequest,
  );

  try {
    await db.insert(transactions).values({
      transaction_id: transactionId,
      message_id: trackContext.message_id,
      action: "track",
      bap_id: bap.subscriberId,
      bpp_id: bpp.subscriberId,
      domain,
      city,
      request_body: trackRequest,
      status: trackStatus === 200 ? "ACK" : "NACK",
      is_simulated: true,
    });
  } catch {
    // Non-critical
  }

  const allOk =
    searchStatus === 200 &&
    selectStatus === 200 &&
    initStatus === 200 &&
    confirmStatus === 200 &&
    statusStatus === 200 &&
    trackStatus === 200;

  console.log(
    `    Order #${orderIndex}: ${allOk ? "COMPLETE" : "PARTIAL"} ` +
      `(search=${searchStatus} select=${selectStatus} init=${initStatus} ` +
      `confirm=${confirmStatus} status=${statusStatus} track=${trackStatus})`,
  );

  return allOk;
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function resetSimulatedData(db: ReturnType<typeof createDb>["db"]): Promise<void> {
  console.log("Resetting simulated data...");

  // Delete simulated transactions
  try {
    await db.delete(transactions).where(eq(transactions.is_simulated, true));
    console.log("  Deleted simulated transactions");
  } catch (err) {
    console.error(`  Failed to delete transactions: ${err}`);
  }

  // Delete simulated subscribers
  try {
    await db.delete(subscribers).where(eq(subscribers.is_simulated, true));
    console.log("  Deleted simulated subscribers");
  } catch (err) {
    console.error(`  Failed to delete subscribers: ${err}`);
  }

  // Delete simulation runs
  try {
    await db.delete(simulationRuns);
    console.log("  Deleted simulation runs");
  } catch (err) {
    console.error(`  Failed to delete simulation runs: ${err}`);
  }

  console.log("Reset complete.\n");
}

// ---------------------------------------------------------------------------
// Main simulation function
// ---------------------------------------------------------------------------

interface SimulateOptions {
  baps: string;
  bpps: string;
  orders: string;
  domains: string;
  cities: string;
  live: boolean;
  reset: boolean;
}

async function simulate(opts: SimulateOptions): Promise<void> {
  const numBaps = parseInt(opts.baps, 10);
  const numBpps = parseInt(opts.bpps, 10);
  const numOrders = parseInt(opts.orders, 10);
  const domainFilter = opts.domains
    ? opts.domains
        .split(",")
        .map((d) => d.trim())
        .map((d) => DOMAIN_MAP[d] ?? d)
        .filter(Boolean)
    : [];
  const cityFilter = opts.cities
    ? opts.cities
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  console.log("=== ONDC Network Simulation ===\n");
  console.log(`Configuration:`);
  console.log(`  BAPs:    ${numBaps}`);
  console.log(`  BPPs:    ${numBpps}`);
  console.log(`  Orders:  ${numOrders}`);
  console.log(`  Domains: ${domainFilter.length > 0 ? domainFilter.join(", ") : "all"}`);
  console.log(`  Cities:  ${cityFilter.length > 0 ? cityFilter.join(", ") : "all"}`);
  console.log(`  Live:    ${opts.live}`);
  console.log(`  Reset:   ${opts.reset}`);
  console.log("");

  // Connect to database
  console.log("Connecting to database...");
  const { db, pool } = createDb(DATABASE_URL);

  try {
    const client = await pool.connect();
    client.release();
    console.log("Database connected.\n");
  } catch (err) {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  }

  try {
    // Reset if requested
    if (opts.reset) {
      await resetSimulatedData(db);
    }

    // Create simulation run record
    const simulationConfig = {
      baps: numBaps,
      bpps: numBpps,
      orders: numOrders,
      domains: domainFilter,
      cities: cityFilter,
      live: opts.live,
    };

    let simulationRunId: string | undefined;
    try {
      const [run] = await db
        .insert(simulationRuns)
        .values({
          config: simulationConfig,
          status: "RUNNING",
        })
        .returning({ id: simulationRuns.id });
      simulationRunId = run?.id;
      console.log(`Simulation run created: ${simulationRunId}\n`);
    } catch (err) {
      console.warn(`Failed to create simulation run record: ${err}\n`);
    }

    // -----------------------------------------------------------------------
    // Step 1: Generate BAPs
    // -----------------------------------------------------------------------
    console.log(`--- Generating ${numBaps} BAPs ---`);
    const baps: SimulatedSubscriber[] = [];

    for (let i = 0; i < numBaps; i++) {
      const name = i < BAP_NAMES.length ? BAP_NAMES[i]! : `SimBAP-${i + 1}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const keys = await generateKeyPair();

      const bap: SimulatedSubscriber = {
        subscriberId: `${slug}.sim.ondc.local`,
        subscriberUrl: `${MOCK_SERVER_URL}/bap/callback`,
        type: "BAP",
        domain: pickRandom(domainFilter.length > 0 ? domainFilter : Object.values(DOMAIN_MAP)),
        city: pickRandom(cityFilter.length > 0 ? cityFilter : CITY_CODES),
        signingPublicKey: keys.signingPublicKey,
        signingPrivateKey: keys.signingPrivateKey,
        encrPublicKey: keys.encrPublicKey,
        encrPrivateKey: keys.encrPrivateKey,
        uniqueKeyId: `sim-bap-key-${randomBytes(4).toString("hex")}`,
        webhookUrl: `${MOCK_SERVER_URL}/bap/callback`,
        name,
      };

      await registerSubscriber(bap, db);
      baps.push(bap);
    }

    console.log(`\nGenerated ${baps.length} BAPs.\n`);

    // -----------------------------------------------------------------------
    // Step 2: Generate BPPs
    // -----------------------------------------------------------------------
    console.log(`--- Generating ${numBpps} BPPs ---`);
    const bpps: SimulatedSubscriber[] = [];

    const allDomains = domainFilter.length > 0 ? domainFilter : Object.values(DOMAIN_MAP);

    for (let i = 0; i < numBpps; i++) {
      // Assign domain round-robin across available domains
      const domain = allDomains[i % allDomains.length]!;
      const domainKey = Object.entries(DOMAIN_MAP).find(([, v]) => v === domain)?.[0] ?? "water";
      const domainNames = BPP_NAMES[domainKey] ?? BPP_NAMES["water"]!;
      const name =
        i < domainNames.length
          ? domainNames[i % domainNames.length]!
          : `SimBPP-${domainKey}-${i + 1}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const keys = await generateKeyPair();

      const bpp: SimulatedSubscriber = {
        subscriberId: `${slug}.sim.ondc.local`,
        subscriberUrl: `${MOCK_SERVER_URL}/bpp/action`,
        type: "BPP",
        domain,
        city: pickRandom(cityFilter.length > 0 ? cityFilter : CITY_CODES),
        signingPublicKey: keys.signingPublicKey,
        signingPrivateKey: keys.signingPrivateKey,
        encrPublicKey: keys.encrPublicKey,
        encrPrivateKey: keys.encrPrivateKey,
        uniqueKeyId: `sim-bpp-key-${randomBytes(4).toString("hex")}`,
        webhookUrl: `${MOCK_SERVER_URL}/bpp/action`,
        name,
      };

      await registerSubscriber(bpp, db);
      bpps.push(bpp);

      // Optionally store catalog via BPP adapter API
      try {
        await httpPost(`${BPP_ADAPTER_URL}/api/catalog`, {
          subscriber_id: bpp.subscriberId,
          domain: bpp.domain,
          city: bpp.city,
        });
      } catch {
        // Non-critical - BPP adapter may not be running
      }
    }

    console.log(`\nGenerated ${bpps.length} BPPs.\n`);

    // -----------------------------------------------------------------------
    // Step 3: Generate orders
    // -----------------------------------------------------------------------
    if (opts.live) {
      console.log("--- Live mode: generating 1 order/second continuously ---");
      console.log("Press Ctrl+C to stop.\n");

      let orderIndex = 1;
      let successCount = 0;
      let failCount = 0;

      const handleShutdown = async () => {
        console.log(`\n\nLive simulation stopped.`);
        console.log(`  Total orders attempted: ${orderIndex - 1}`);
        console.log(`  Successful: ${successCount}`);
        console.log(`  Failed/partial: ${failCount}`);

        // Update simulation run
        if (simulationRunId) {
          try {
            await db
              .update(simulationRuns)
              .set({
                completed_at: new Date(),
                status: "COMPLETED",
                stats: {
                  baps: numBaps,
                  bpps: numBpps,
                  orders_attempted: orderIndex - 1,
                  orders_successful: successCount,
                  orders_failed: failCount,
                },
              })
              .where(eq(simulationRuns.id, simulationRunId));
          } catch {
            // Non-critical
          }
        }

        await pool.end();
        process.exit(0);
      };

      process.on("SIGINT", () => void handleShutdown());
      process.on("SIGTERM", () => void handleShutdown());

      while (true) {
        const bap = pickRandom(baps);
        const timestamp = new Date();

        const success = await simulateOrder(
          bap,
          bpps,
          domainFilter,
          cityFilter,
          orderIndex,
          db,
          timestamp,
        );

        if (success) successCount++;
        else failCount++;

        orderIndex++;
        await sleep(1000);
      }
    } else {
      console.log(`--- Generating ${numOrders} orders ---\n`);

      let successCount = 0;
      let failCount = 0;
      const baseDate = new Date();

      for (let i = 1; i <= numOrders; i++) {
        const bap = pickRandom(baps);
        const timestamp = generateRealisticTimestamp(baseDate);

        const success = await simulateOrder(
          bap,
          bpps,
          domainFilter,
          cityFilter,
          i,
          db,
          timestamp,
        );

        if (success) successCount++;
        else failCount++;

        // Brief delay to avoid overwhelming the mock server
        if (i % 10 === 0) {
          await sleep(100);
        }
      }

      console.log(`\n=== Simulation Complete ===`);
      console.log(`  BAPs registered:       ${baps.length}`);
      console.log(`  BPPs registered:       ${bpps.length}`);
      console.log(`  Orders attempted:      ${numOrders}`);
      console.log(`  Successful:            ${successCount}`);
      console.log(`  Failed/partial:        ${failCount}`);

      // Update simulation run
      if (simulationRunId) {
        try {
          await db
            .update(simulationRuns)
            .set({
              completed_at: new Date(),
              status: "COMPLETED",
              stats: {
                baps: numBaps,
                bpps: numBpps,
                orders_attempted: numOrders,
                orders_successful: successCount,
                orders_failed: failCount,
              },
            })
            .where(eq(simulationRuns.id, simulationRunId));
          console.log(`\nSimulation run ${simulationRunId} marked COMPLETED.`);
        } catch (err) {
          console.warn(`Failed to update simulation run: ${err}`);
        }
      }
    }
  } catch (err) {
    console.error("\nSimulation failed:", err);

    // Mark simulation as failed
    try {
      const runs = await db
        .select()
        .from(simulationRuns)
        .where(eq(simulationRuns.status, "RUNNING"))
        .limit(1);

      if (runs[0]) {
        await db
          .update(simulationRuns)
          .set({
            completed_at: new Date(),
            status: "FAILED",
            stats: { error: String(err) },
          })
          .where(eq(simulationRuns.id, runs[0].id));
      }
    } catch {
      // Non-critical
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("simulate")
  .description(
    "Generate simulated ONDC network participants and order flows for testing",
  )
  .option("--baps <number>", "Number of simulated BAPs to create", "3")
  .option("--bpps <number>", "Number of simulated BPPs to create", "10")
  .option("--orders <number>", "Number of order flows to simulate", "100")
  .option(
    "--domains <list>",
    "Comma-separated list of domains (water,food,agriculture,logistics)",
    "",
  )
  .option(
    "--cities <list>",
    "Comma-separated list of city codes (std:011,std:080,...)",
    "",
  )
  .option("--live", "Run continuously generating 1 order/second", false)
  .option("--reset", "Delete all simulated data before running", false)
  .action(async (opts: SimulateOptions) => {
    await simulate(opts);
  });

program.parse();
