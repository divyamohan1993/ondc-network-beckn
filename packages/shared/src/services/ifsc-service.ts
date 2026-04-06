import { request } from "undici";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("ifsc");

const RAZORPAY_IFSC_API = "https://ifsc.razorpay.com";

export interface BankDetails {
  ifsc: string;
  bank: string;
  branch: string;
  address: string;
  city: string;
  state: string;
  district: string;
  contact?: string;
  micr?: string;
  upi: boolean;
  rtgs: boolean;
  neft: boolean;
  imps: boolean;
  swift?: string;
}

/**
 * Validate and fetch bank details by IFSC code using Razorpay's public API.
 * Data source: RBI (Reserve Bank of India) master IFSC database.
 */
export async function validateIfsc(ifsc: string): Promise<{
  valid: boolean;
  bank?: BankDetails;
  error?: string;
}> {
  // Format validation: 4 uppercase letters + 0 + 6 alphanumeric
  if (!ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
    return {
      valid: false,
      error:
        "Invalid IFSC format. Must be 11 characters: 4 letters + 0 + 6 alphanumeric",
    };
  }

  try {
    const res = await request(`${RAZORPAY_IFSC_API}/${ifsc.toUpperCase()}`, {
      method: "GET",
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });

    if (res.statusCode === 404) {
      return {
        valid: false,
        error: `IFSC code ${ifsc} not found in RBI database`,
      };
    }

    if (res.statusCode !== 200) {
      logger.warn(
        { ifsc, statusCode: res.statusCode },
        "IFSC API returned non-200",
      );
      return { valid: false, error: "IFSC verification service unavailable" };
    }

    const data = (await res.body.json()) as Record<string, unknown>;

    return {
      valid: true,
      bank: {
        ifsc: data["IFSC"] as string,
        bank: data["BANK"] as string,
        branch: data["BRANCH"] as string,
        address: data["ADDRESS"] as string,
        city: data["CITY"] as string,
        state: data["STATE"] as string,
        district: data["DISTRICT"] as string,
        contact: (data["CONTACT"] as string) || undefined,
        micr: (data["MICR"] as string) || undefined,
        upi: data["UPI"] === true,
        rtgs: data["RTGS"] === true,
        neft: data["NEFT"] === true,
        imps: data["IMPS"] === true,
        swift: (data["SWIFT"] as string) || undefined,
      },
    };
  } catch (err) {
    logger.error({ err, ifsc }, "IFSC validation failed");
    return { valid: false, error: "IFSC verification service error" };
  }
}
