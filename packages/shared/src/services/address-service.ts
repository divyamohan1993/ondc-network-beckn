import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { indiaPincodes } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("address-service");

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
}
