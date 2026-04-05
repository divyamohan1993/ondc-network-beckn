import https from "node:https";
import type { TLSSocket } from "node:tls";
import { createLogger } from "@ondc/shared/utils";

const logger = createLogger("ocsp-validator");

/**
 * Validate SSL/TLS certificate status for a subscriber's endpoint.
 * Checks that the certificate is valid, not expired, and not self-signed
 * with a broken chain.
 *
 * @param url - The subscriber's URL (e.g., "https://seller.example.com")
 * @returns Validation result with optional error and certificate details
 */
export async function validateCertificate(
  url: string,
): Promise<{
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== "https:") {
        resolve({ valid: false, error: "URL must use HTTPS" });
        return;
      }

      const req = https.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: "/",
          method: "HEAD",
          timeout: 10_000,
          rejectUnauthorized: true,
        },
        (res) => {
          const socket = res.socket as TLSSocket;
          const cert = socket.getPeerCertificate(true);

          if (!cert || !cert.subject) {
            resolve({ valid: false, error: "No certificate returned" });
            return;
          }

          const now = new Date();
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);

          if (now < validFrom) {
            resolve({
              valid: false,
              error: "Certificate not yet valid",
              details: { valid_from: cert.valid_from },
            });
            return;
          }

          if (now > validTo) {
            resolve({
              valid: false,
              error: "Certificate expired",
              details: { valid_to: cert.valid_to },
            });
            return;
          }

          const isSelfSigned =
            cert.issuer?.CN === cert.subject?.CN && !cert.issuer?.O;

          logger.info(
            {
              hostname: urlObj.hostname,
              subject: cert.subject?.CN,
              issuer: cert.issuer?.CN,
              valid_to: cert.valid_to,
              selfSigned: isSelfSigned,
            },
            "Certificate validation passed",
          );

          resolve({
            valid: true,
            details: {
              subject: cert.subject?.CN,
              issuer: cert.issuer?.CN || cert.issuer?.O,
              valid_from: cert.valid_from,
              valid_to: cert.valid_to,
              serialNumber: cert.serialNumber,
              fingerprint256: cert.fingerprint256,
              selfSigned: isSelfSigned,
            },
          });
        },
      );

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "CERT_HAS_EXPIRED") {
          resolve({ valid: false, error: "Certificate has expired" });
        } else if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
          resolve({
            valid: false,
            error: "Unable to verify certificate chain",
          });
        } else if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
          resolve({
            valid: false,
            error: "Certificate hostname mismatch",
          });
        } else {
          resolve({ valid: false, error: `TLS error: ${err.message}` });
        }
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ valid: false, error: "Connection timed out" });
      });

      req.end();
    } catch (err: any) {
      resolve({ valid: false, error: `URL parse error: ${err.message}` });
    }
  });
}
