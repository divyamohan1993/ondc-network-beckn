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
const SALT_LENGTH = 32;

// ---------------------------------------------------------------------------
// EncryptionService
// ---------------------------------------------------------------------------

/**
 * AES-256-GCM encryption service for the vault.
 *
 * The encryption key is derived from a master key using PBKDF2 with 100,000
 * iterations with a unique random salt per operation. Each encrypt uses a
 * unique 12-byte IV. The output format is: base64(salt + iv + authTag + ciphertext)
 */
export class EncryptionService {
  constructor(private readonly masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error(
        "VAULT_MASTER_KEY must be at least 16 characters long",
      );
    }

    // Key is derived per-operation with a unique salt (see encrypt/decrypt)
    // We keep masterKey for deriving keys on the fly
  }

  private deriveKey(salt: Buffer): Buffer {
    return pbkdf2Sync(
      this.masterKey,
      salt,
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
    const salt = randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Concatenate salt + iv + authTag + ciphertext and base64 encode
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
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

    if (combined.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("Invalid encrypted data: too short");
    }

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = this.deriveKey(salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
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
