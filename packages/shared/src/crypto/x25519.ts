import nacl from "tweetnacl";
import { seal, open } from "tweetnacl-sealedbox-js";

export interface X25519KeyPair {
  privateKey: string;
  publicKey: string;
}

/** ASN.1 DER prefix for X25519 public keys (first 12 bytes of the DER encoding) */
const X25519_ASN1_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

/**
 * Strip the ASN.1 DER prefix from an X25519 public key if present.
 * ONDC subscribe flow uses DER-encoded keys (starting with MCowBQYDK2VuAyEA).
 * Raw 32-byte keys are returned as-is.
 */
function stripAsn1Prefix(keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length === 44 || keyBytes.length === 12 + 32) {
    const prefix = keyBytes.subarray(0, 12);
    if (Buffer.from(prefix).equals(X25519_ASN1_PREFIX)) {
      return keyBytes.subarray(12);
    }
  }
  return keyBytes;
}

/**
 * Generate an X25519 key pair for encryption/decryption using NaCl sealed boxes.
 * @returns Object with base64-encoded privateKey (32 bytes) and publicKey (32 bytes).
 */
export function generateEncryptionKeyPair(): X25519KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    privateKey: Buffer.from(keyPair.secretKey).toString("base64"),
    publicKey: Buffer.from(keyPair.publicKey).toString("base64"),
  };
}

/**
 * Encrypt data using NaCl crypto_box_seal (sealed box).
 * Compatible with libsodium's crypto_box_seal used by ONDC.
 *
 * Output: base64(ephemeralPubKey(32) | encrypted(message + MAC))
 *
 * @param data - The plaintext string to encrypt.
 * @param publicKeyBase64 - Base64-encoded X25519 public key of the recipient (raw or ASN.1 DER encoded).
 * @returns Base64-encoded sealed box ciphertext.
 */
export function encrypt(data: string, publicKeyBase64: string): string {
  const rawKey = stripAsn1Prefix(Buffer.from(publicKeyBase64, "base64"));
  const messageBytes = Buffer.from(data, "utf-8");
  const encrypted = seal(messageBytes, rawKey);
  return Buffer.from(encrypted).toString("base64");
}

/**
 * Decrypt data encrypted with NaCl crypto_box_seal (sealed box).
 * Compatible with libsodium's crypto_box_seal_open used by ONDC.
 *
 * @param data - Base64-encoded sealed box ciphertext.
 * @param privateKeyBase64 - Base64-encoded X25519 secret key (32 bytes).
 * @param publicKeyBase64 - Base64-encoded X25519 public key (raw or ASN.1 DER encoded).
 * @returns Decrypted plaintext string.
 */
export function decrypt(
  data: string,
  privateKeyBase64: string,
  publicKeyBase64: string,
): string {
  const secretKey = Buffer.from(privateKeyBase64, "base64");
  const publicKey = stripAsn1Prefix(Buffer.from(publicKeyBase64, "base64"));
  const encrypted = Buffer.from(data, "base64");
  const decrypted = open(encrypted, publicKey, secretKey);
  if (!decrypted) {
    throw new Error("Decryption failed");
  }
  return Buffer.from(decrypted).toString("utf-8");
}
