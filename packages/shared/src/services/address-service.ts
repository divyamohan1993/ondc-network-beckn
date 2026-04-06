import { eq, sql } from "drizzle-orm";
import { request } from "undici";
import type { Database } from "../db/index.js";
import { indiaPincodes } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("address-service");

const DATAGOVIN_BASE = "https://api.data.gov.in/resource/5c2f62fe-5afa-4119-a499-fec9d604d5bd";

export interface AddressValidation {
  valid: boolean;
  errors: string[];
  suggestions?: {
    city?: string;
    state?: string;
    district?: string;
  };
  deliveryAvailable: boolean;
  coordinates?: { lat: number; lng: number };
}

export class AddressService {
  constructor(private db: Database) {}

  /**
   * Validate an Indian delivery address.
   * Checks pincode validity, city/state matching, and delivery availability.
   */
  async validateAddress(params: {
    pincode: string;
    city?: string;
    state?: string;
    addressLine?: string;
  }): Promise<AddressValidation> {
    const errors: string[] = [];

    // Pincode format validation
    if (!params.pincode || !/^\d{6}$/.test(params.pincode)) {
      return {
        valid: false,
        errors: ["Invalid pincode format. Must be 6 digits."],
        deliveryAvailable: false,
      };
    }

    // Lookup pincode in database
    const [record] = await this.db
      .select()
      .from(indiaPincodes)
      .where(eq(indiaPincodes.pincode, params.pincode))
      .limit(1);

    if (!record) {
      return {
        valid: false,
        errors: [`Pincode ${params.pincode} not found in database`],
        deliveryAvailable: false,
      };
    }

    // Check city mismatch
    if (
      params.city &&
      params.city.toLowerCase() !== record.city.toLowerCase()
    ) {
      errors.push(
        `City mismatch: provided "${params.city}", expected "${record.city}" for pincode ${params.pincode}`,
      );
    }

    // Check state mismatch
    if (
      params.state &&
      params.state.toLowerCase() !== record.state.toLowerCase()
    ) {
      errors.push(
        `State mismatch: provided "${params.state}", expected "${record.state}" for pincode ${params.pincode}`,
      );
    }

    // Address line required
    if (!params.addressLine || params.addressLine.trim().length < 10) {
      errors.push("Address line must be at least 10 characters");
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions: {
        city: record.city,
        state: record.state,
        district: record.district ?? undefined,
      },
      deliveryAvailable: record.delivery_available ?? true,
      coordinates:
        record.latitude && record.longitude
          ? { lat: Number(record.latitude), lng: Number(record.longitude) }
          : undefined,
    };
  }

  /**
   * Check if delivery is available to a pincode.
   */
  async isDeliveryAvailable(pincode: string): Promise<boolean> {
    const [record] = await this.db
      .select({ available: indiaPincodes.delivery_available })
      .from(indiaPincodes)
      .where(eq(indiaPincodes.pincode, pincode))
      .limit(1);

    return record?.available ?? false;
  }

  /**
   * Seed pincode database from India Post data.
   * Call this once during setup.
   */
  async seedPincodes(
    data: Array<{
      pincode: string;
      city: string;
      state: string;
      district?: string;
      region?: string;
      latitude?: number;
      longitude?: number;
    }>,
  ): Promise<number> {
    let inserted = 0;
    // Batch insert in chunks of 1000
    for (let i = 0; i < data.length; i += 1000) {
      const chunk = data.slice(i, i + 1000);
      await this.db
        .insert(indiaPincodes)
        .values(
          chunk.map((p) => ({
            pincode: p.pincode,
            city: p.city,
            state: p.state,
            district: p.district,
            region: p.region,
            latitude: p.latitude != null ? String(p.latitude) : null,
            longitude: p.longitude != null ? String(p.longitude) : null,
          })),
        )
        .onConflictDoNothing();
      inserted += chunk.length;
    }
    logger.info({ total: inserted }, "Pincodes seeded");
    return inserted;
  }

  /**
   * Fetch all India Post pincodes from data.gov.in API and seed into DB.
   * Uses the official Government of India Open Data API.
   *
   * @param apiKey - data.gov.in API key (DATAGOVIN env var)
   * @returns number of pincodes inserted
   */
  async fetchAndSeedFromDataGovIn(apiKey: string): Promise<number> {
    // Check if DB already has pincodes
    const [existing] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(indiaPincodes);

    if (existing && existing.count > 0) {
      logger.info({ existingCount: existing.count }, "Pincode database already seeded, skipping fetch");
      return existing.count;
    }

    logger.info("Fetching pincodes from data.gov.in...");

    let totalInserted = 0;
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const url = `${DATAGOVIN_BASE}?api-key=${apiKey}&format=json&limit=${limit}&offset=${offset}`;

      try {
        const res = await request(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          headersTimeout: 30000,
          bodyTimeout: 30000,
        });

        if (res.statusCode !== 200) {
          const body = await res.body.text();
          logger.error({ statusCode: res.statusCode, body: body.slice(0, 200) }, "data.gov.in API error");
          break;
        }

        const json = (await res.body.json()) as {
          total: number;
          count: number;
          records: Array<{
            pincode: string;
            officename: string;
            statename: string;
            district: string;
            regionname: string;
            circlename: string;
            divisionname: string;
            officetype: string;
            delivery: string;
            latitude?: string;
            longitude?: string;
          }>;
        };

        if (!json.records || json.records.length === 0) {
          hasMore = false;
          break;
        }

        // Deduplicate by pincode (API returns one row per post office, multiple offices per pincode)
        const uniquePincodes = new Map<string, {
          pincode: string;
          city: string;
          state: string;
          district: string;
          region: string;
          latitude?: number;
          longitude?: number;
          deliveryAvailable: boolean;
        }>();

        for (const record of json.records) {
          const pin = String(record.pincode).padStart(6, "0");
          if (pin.length !== 6 || !/^\d{6}$/.test(pin)) continue;

          // Keep first occurrence per pincode (head/sub office preferred over branch)
          if (!uniquePincodes.has(pin)) {
            uniquePincodes.set(pin, {
              pincode: pin,
              city: record.divisionname || record.officename,
              state: record.statename,
              district: record.district,
              region: record.regionname,
              latitude: record.latitude ? parseFloat(record.latitude) : undefined,
              longitude: record.longitude ? parseFloat(record.longitude) : undefined,
              deliveryAvailable: record.delivery === "Delivery",
            });
          }
        }

        // Insert batch
        const batch = Array.from(uniquePincodes.values());
        if (batch.length > 0) {
          await this.db
            .insert(indiaPincodes)
            .values(
              batch.map((p) => ({
                pincode: p.pincode,
                city: p.city,
                state: p.state,
                district: p.district,
                region: p.region,
                latitude: p.latitude != null ? String(p.latitude) : null,
                longitude: p.longitude != null ? String(p.longitude) : null,
                delivery_available: p.deliveryAvailable,
              })),
            )
            .onConflictDoNothing();

          totalInserted += batch.length;
        }

        logger.info({ offset, fetched: json.records.length, inserted: batch.length, total: json.total }, "Pincode batch processed");

        offset += limit;
        hasMore = offset < json.total;

        // Rate limit: data.gov.in allows ~1000 req/day, be gentle
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (err) {
        logger.error({ err, offset }, "Failed to fetch pincode batch from data.gov.in");
        break;
      }
    }

    logger.info({ totalInserted }, "Pincode seeding from data.gov.in complete");
    return totalInserted;
  }
}
