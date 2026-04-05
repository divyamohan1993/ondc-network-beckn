import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { createLogger } from "./logger.js";

const logger = createLogger("pii-guard");

// -------------------------------------------------------------------------
// PII field paths in Beckn messages that contain personal data.
// "*" acts as a wildcard for array iteration.
// -------------------------------------------------------------------------

const PII_PATHS: string[] = [
  "message.order.billing.name",
  "message.order.billing.phone",
  "message.order.billing.email",
  "message.order.billing.address",
  "message.order.fulfillments.*.end.contact.phone",
  "message.order.fulfillments.*.end.contact.email",
  "message.order.fulfillments.*.end.location.address",
  "message.order.fulfillments.*.start.contact.phone",
  "message.order.fulfillments.*.start.contact.email",
  "message.order.fulfillments.*.start.location.address",
  "message.intent.fulfillment.end.contact",
  "message.intent.fulfillment.start.contact",
];

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PII_PREFIX = "PII:";

// -------------------------------------------------------------------------
// Encryption / decryption primitives
// -------------------------------------------------------------------------

/**
 * Encrypt a single string value with AES-256-GCM.
 * Returns a prefixed base64 blob: "PII:<base64(iv + authTag + ciphertext)>".
 */
export function encryptPii(value: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return PII_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a PII-prefixed value. Non-prefixed strings pass through unchanged.
 */
export function decryptPii(encrypted: string, key: Buffer): string {
  if (!encrypted.startsWith(PII_PREFIX)) return encrypted;
  const data = Buffer.from(encrypted.slice(PII_PREFIX.length), "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf-8",
  );
}

// -------------------------------------------------------------------------
// Deep traversal helpers
// -------------------------------------------------------------------------

function traverseAndEncrypt(
  obj: any,
  parts: string[],
  idx: number,
  key: Buffer,
): void {
  if (!obj || typeof obj !== "object" || idx >= parts.length) return;
  const part = parts[idx]!;

  if (part === "*") {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        traverseAndEncrypt(item, parts, idx + 1, key);
      }
    }
    return;
  }

  if (idx === parts.length - 1) {
    // Leaf node: encrypt the value(s)
    if (typeof obj[part] === "string" && !obj[part].startsWith(PII_PREFIX)) {
      obj[part] = encryptPii(obj[part], key);
    } else if (typeof obj[part] === "object" && obj[part] !== null) {
      // Encrypt every string value inside a sub-object (e.g., address)
      for (const [k, v] of Object.entries(obj[part])) {
        if (typeof v === "string" && !v.startsWith(PII_PREFIX)) {
          obj[part][k] = encryptPii(v, key);
        }
      }
    }
  } else {
    traverseAndEncrypt(obj[part], parts, idx + 1, key);
  }
}

function traverseAndDecrypt(obj: any, key: Buffer): void {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.startsWith(PII_PREFIX)) {
      try {
        obj[k] = decryptPii(v, key);
      } catch {
        // leave encrypted if key mismatch or corruption
      }
    } else if (typeof v === "object" && v !== null) {
      traverseAndDecrypt(v, key);
    }
  }
}

// -------------------------------------------------------------------------
// Public API: mask / unmask entire Beckn message bodies
// -------------------------------------------------------------------------

/**
 * Deep-clone a Beckn body and encrypt all PII field values.
 * Safe to call on non-object inputs (returns them unchanged).
 */
export function maskPiiInBody(body: unknown, key: Buffer): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body));
  for (const path of PII_PATHS) {
    traverseAndEncrypt(clone, path.split("."), 0, key);
  }
  return clone;
}

/**
 * Deep-clone a Beckn body and decrypt every PII-prefixed string in it.
 */
export function unmaskPiiInBody(body: unknown, key: Buffer): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body));
  traverseAndDecrypt(clone, key);
  return clone;
}

// -------------------------------------------------------------------------
// Anonymization (right to erasure)
// -------------------------------------------------------------------------

/**
 * One-way SHA-256 hash for pseudonymized dedup (phone/email).
 */
export function hashPiiValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Anonymize all PII fields in a Beckn body for right-to-erasure.
 * Names and addresses become "REDACTED". Phones and emails become
 * one-way hashes so dedup still works without revealing identity.
 */
export function anonymizePiiInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body));
  anonymizeRecursive(clone);
  return clone;
}

const PHONE_KEYS = new Set(["phone", "mobile"]);
const EMAIL_KEYS = new Set(["email"]);
const NAME_KEYS = new Set(["name"]);
const ADDRESS_KEYS = new Set([
  "address",
  "street",
  "locality",
  "door",
  "building",
  "area_code",
]);

function anonymizeRecursive(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (typeof v === "string") {
      // Decrypt first if encrypted, then anonymize
      let plain = v;
      if (v.startsWith(PII_PREFIX)) {
        // Can't decrypt without key during erasure; replace wholesale
        obj[k] = "REDACTED";
        continue;
      }
      if (PHONE_KEYS.has(lk)) {
        obj[k] = hashPiiValue(plain);
      } else if (EMAIL_KEYS.has(lk)) {
        obj[k] = hashPiiValue(plain);
      } else if (NAME_KEYS.has(lk)) {
        obj[k] = "REDACTED";
      } else if (ADDRESS_KEYS.has(lk)) {
        obj[k] = "REDACTED";
      }
    } else if (typeof v === "object" && v !== null) {
      // If the key itself is "address" and value is object, redact all children
      if (ADDRESS_KEYS.has(lk)) {
        for (const [ak, av] of Object.entries(v as Record<string, unknown>)) {
          if (typeof av === "string") {
            (v as any)[ak] = "REDACTED";
          }
        }
      } else {
        anonymizeRecursive(v);
      }
    }
  }
}

// -------------------------------------------------------------------------
// Key derivation
// -------------------------------------------------------------------------

/**
 * Derive a 256-bit AES key from a master key string using PBKDF2.
 * Call once at startup and reuse the result.
 */
export function derivePiiKey(masterKey: string): Buffer {
  return pbkdf2Sync(masterKey, "ondc-pii-encryption-v1", 100_000, 32, "sha512");
}
