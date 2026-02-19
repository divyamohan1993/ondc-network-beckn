import { x25519 } from "@noble/curves/ed25519.js";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export interface X25519KeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Generate an X25519 key pair for Diffie-Hellman key exchange / encryption.
 * @returns Object with base64-encoded privateKey and publicKey.
 */
export function generateEncryptionKeyPair(): X25519KeyPair {
  const privateKeyBytes = randomBytes(32);
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);

  return {
    privateKey: Buffer.from(privateKeyBytes).toString("base64"),
    publicKey: Buffer.from(publicKeyBytes).toString("base64"),
  };
}

/**
 * Encrypt data using X25519 ECDH + AES-256-GCM.
 *
 * Generates an ephemeral X25519 key pair, derives a shared secret with the
 * recipient's public key, and encrypts the data with AES-256-GCM.
 *
 * Output format (base64 of concatenated):
 *   ephemeralPublicKey (32 bytes) | iv (12 bytes) | authTag (16 bytes) | ciphertext
 *
 * @param data - The plaintext string to encrypt.
 * @param publicKeyBase64 - Base64-encoded X25519 public key of the recipient.
 * @returns Base64-encoded encrypted payload.
 */
export function encrypt(data: string, publicKeyBase64: string): string {
  const recipientPublicKey = Buffer.from(publicKeyBase64, "base64");

  // Generate ephemeral key pair
  const ephemeralPrivateKey = randomBytes(32);
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  // Derive shared secret
  const sharedSecret = x25519.getSharedSecret(
    ephemeralPrivateKey,
    recipientPublicKey,
  );

  // Use the first 32 bytes of shared secret as AES-256 key
  const aesKey = Buffer.from(sharedSecret).subarray(0, 32);
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: ephemeralPublicKey (32) | iv (12) | authTag (16) | ciphertext
  const result = Buffer.concat([
    Buffer.from(ephemeralPublicKey),
    iv,
    authTag,
    encrypted,
  ]);

  return result.toString("base64");
}

/**
 * Decrypt data encrypted with the encrypt() function.
 *
 * @param data - Base64-encoded encrypted payload produced by encrypt().
 * @param privateKeyBase64 - Base64-encoded X25519 private key of the recipient.
 * @param publicKeyBase64 - Not used for decryption (ephemeral key is embedded),
 *                          kept for API symmetry. Pass empty string if not needed.
 * @returns Decrypted plaintext string.
 */
export function decrypt(
  data: string,
  privateKeyBase64: string,
  _publicKeyBase64: string,
): string {
  const payload = Buffer.from(data, "base64");
  const recipientPrivateKey = Buffer.from(privateKeyBase64, "base64");

  // Unpack: ephemeralPublicKey (32) | iv (12) | authTag (16) | ciphertext
  const ephemeralPublicKey = payload.subarray(0, 32);
  const iv = payload.subarray(32, 44);
  const authTag = payload.subarray(44, 60);
  const ciphertext = payload.subarray(60);

  // Derive shared secret
  const sharedSecret = x25519.getSharedSecret(
    recipientPrivateKey,
    ephemeralPublicKey,
  );

  const aesKey = Buffer.from(sharedSecret).subarray(0, 32);

  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
