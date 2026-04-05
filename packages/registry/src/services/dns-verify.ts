import { resolveTxt } from "node:dns/promises";
import { createLogger } from "@ondc/shared/utils";

const logger = createLogger("dns-verify");

/**
 * Verify that a subscriber's domain has a valid ONDC DNS TXT record.
 * The TXT record should contain: "ondc-signing-key=<base64_public_key>"
 *
 * @param domain - The subscriber's domain (e.g., "seller.example.com")
 * @param expectedPublicKey - The base64-encoded signing public key
 * @returns Verification result with optional error message
 */
export async function verifyDnsTxtRecord(
  domain: string,
  expectedPublicKey: string,
): Promise<{ verified: boolean; error?: string }> {
  try {
    const records = await resolveTxt(domain);
    // TXT records come as arrays of string chunks that must be joined
    const flatRecords = records.map((chunks) => chunks.join(""));

    const ondcRecord = flatRecords.find((r) =>
      r.startsWith("ondc-signing-key="),
    );
    if (!ondcRecord) {
      return {
        verified: false,
        error: `No ondc-signing-key TXT record found for ${domain}`,
      };
    }

    const recordKey = ondcRecord.replace("ondc-signing-key=", "").trim();
    if (recordKey !== expectedPublicKey) {
      return {
        verified: false,
        error: "DNS TXT record signing key does not match provided key",
      };
    }

    logger.info({ domain }, "DNS TXT record verification passed");
    return { verified: true };
  } catch (err: any) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return {
        verified: false,
        error: `No DNS records found for ${domain}`,
      };
    }
    logger.error({ err, domain }, "DNS TXT verification failed");
    return { verified: false, error: `DNS lookup failed: ${err.message}` };
  }
}
