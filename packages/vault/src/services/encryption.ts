import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  type CipherGCMTypes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha512";
const PBKDF2_SALT = "ondc-vault-key-derivation-salt-v1";

// ---------------------------------------------------------------------------
// EncryptionService
// ---------------------------------------------------------------------------

/**
 * AES-256-GCM encryption service for the vault.
 *
 * The encryption key is derived from a master key using PBKDF2 with 100,000
 * iterations. Each encrypt operation uses a unique 12-byte IV. The output
 * format is: base64(iv + authTag + ciphertext)
 */
export class EncryptionService {
  private readonly key: Buffer;

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error(
        "VAULT_MASTER_KEY must be at least 16 characters long",
      );
    }

    this.key = pbkdf2Sync(
      masterKey,
      PBKDF2_SALT,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   *
   * @param plaintext - The text to encrypt
   * @returns base64-encoded string containing iv + authTag + ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Concatenate iv + authTag + ciphertext and base64 encode
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  /**
   * Decrypt a base64-encoded AES-256-GCM encrypted string.
   *
   * @param encrypted - base64-encoded string containing iv + authTag + ciphertext
   * @returns The decrypted plaintext string
   * @throws Error if decryption fails (tampered data, wrong key, etc.)
   */
  decrypt(encrypted: string): string {
    const combined = Buffer.from(encrypted, "base64");

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("Invalid encrypted data: too short");
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Generate a cryptographically secure random password.
   *
   * @param length - Length of the password in bytes (output will be hex-encoded,
   *   so the string length is 2x this value)
   * @returns A hex-encoded random string
   */
  static generatePassword(length: number = 32): string {
    return randomBytes(length).toString("hex");
  }

  /**
   * Generate a cryptographically secure random token.
   *
   * @param length - Length of the token in bytes (output is base64url-encoded)
   * @returns A base64url-encoded random string
   */
  static generateToken(length: number = 48): string {
    return randomBytes(length)
      .toString("base64url");
  }
}
