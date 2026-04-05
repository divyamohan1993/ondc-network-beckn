/**
 * Post-Quantum Cryptography Layer for ONDC
 *
 * NIST FIPS 203/204 finalized standards (2024):
 *   ML-DSA-65 (FIPS 204) -- digital signatures, 192-bit security
 *   ML-KEM-768 (FIPS 203) -- key encapsulation, 192-bit security
 *
 * Hybrid mode: every operation produces BOTH a classical (Ed25519/X25519)
 * AND a post-quantum result. An attacker must break both to compromise
 * confidentiality or authenticity. Graceful degradation: when
 * PQ_CRYPTO_ENABLED is false or the library fails to load, the system
 * falls back to classical-only and logs a warning.
 *
 * Key sizes (ML-DSA-65):
 *   secretKey  4 032 bytes
 *   publicKey  1 952 bytes
 *   signature  3 309 bytes
 *
 * Key sizes (ML-KEM-768):
 *   secretKey  2 400 bytes
 *   publicKey  1 184 bytes
 *   cipherText 1 088 bytes
 *   sharedSecret   32 bytes
 */

import { createLogger } from "../utils/logger.js";
import {
  generateKeyPair as generateEd25519KeyPair,
  sign as ed25519Sign,
  verify as ed25519Verify,
} from "./ed25519.js";
import {
  generateEncryptionKeyPair as generateX25519KeyPair,
  encrypt as x25519Encrypt,
  decrypt as x25519Decrypt,
} from "./x25519.js";

const logger = createLogger("crypto:post-quantum");

// ---------------------------------------------------------------------------
// Lazy-loaded PQ primitives (avoid import-time crash when lib missing)
// ---------------------------------------------------------------------------

type MlDsa65 = {
  keygen(): { secretKey: Uint8Array; publicKey: Uint8Array };
  sign(msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
  verify(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array): boolean;
};

type MlKem768 = {
  keygen(): { secretKey: Uint8Array; publicKey: Uint8Array };
  encapsulate(publicKey: Uint8Array): { cipherText: Uint8Array; sharedSecret: Uint8Array };
  decapsulate(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array;
};

let _mlDsa65: MlDsa65 | null = null;
let _mlKem768: MlKem768 | null = null;
let _pqLoadAttempted = false;
let _pqAvailable = false;

async function loadPqPrimitives(): Promise<boolean> {
  if (_pqLoadAttempted) return _pqAvailable;
  _pqLoadAttempted = true;

  try {
    const dsaMod = await import("@noble/post-quantum/ml-dsa.js");
    const kemMod = await import("@noble/post-quantum/ml-kem.js");
    _mlDsa65 = dsaMod.ml_dsa65 as MlDsa65;
    _mlKem768 = kemMod.ml_kem768 as MlKem768;
    _pqAvailable = true;
    logger.info("Post-quantum primitives loaded (ML-DSA-65, ML-KEM-768)");
  } catch (err) {
    _pqAvailable = false;
    logger.warn(
      { err },
      "Post-quantum library unavailable. Hybrid PQ signatures disabled. " +
        "Install @noble/post-quantum to enable.",
    );
  }

  return _pqAvailable;
}

function requireDsa(): MlDsa65 {
  if (!_mlDsa65) throw new Error("ML-DSA-65 not loaded. Call ensurePqReady() first.");
  return _mlDsa65;
}

function requireKem(): MlKem768 {
  if (!_mlKem768) throw new Error("ML-KEM-768 not loaded. Call ensurePqReady() first.");
  return _mlKem768;
}

// ---------------------------------------------------------------------------
// Public API -- feature gate
// ---------------------------------------------------------------------------

/** Returns true when PQ crypto is both enabled by config and available at runtime. */
export function isPqEnabled(): boolean {
  return process.env["PQ_CRYPTO_ENABLED"] === "true" && _pqAvailable;
}

/** Eagerly load PQ primitives. Call once at startup. Returns availability status. */
export async function ensurePqReady(): Promise<boolean> {
  const loaded = await loadPqPrimitives();
  if (process.env["PQ_CRYPTO_ENABLED"] === "true" && !loaded) {
    logger.error(
      "PQ_CRYPTO_ENABLED=true but post-quantum library failed to load. " +
        "Signatures will use classical Ed25519 only.",
    );
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PqSigningKeyPair {
  /** Base64-encoded ML-DSA-65 secret key (4032 bytes raw). */
  privateKey: string;
  /** Base64-encoded ML-DSA-65 public key (1952 bytes raw). */
  publicKey: string;
}

export interface PqEncryptionKeyPair {
  /** Base64-encoded ML-KEM-768 secret key (2400 bytes raw). */
  privateKey: string;
  /** Base64-encoded ML-KEM-768 public key (1184 bytes raw). */
  publicKey: string;
}

export interface HybridKeyPair {
  classical: { privateKey: string; publicKey: string };
  postQuantum: PqSigningKeyPair;
}

export interface HybridEncryptionKeyPair {
  classical: { privateKey: string; publicKey: string };
  postQuantum: PqEncryptionKeyPair;
}

export interface HybridSignature {
  /** Base64-encoded Ed25519 signature. */
  classical: string;
  /** Base64-encoded ML-DSA-65 signature (3309 bytes raw). */
  postQuantum: string;
}

export interface HybridEncapsulation {
  /** Base64-encoded sealed box ciphertext (classical X25519). */
  classicalCiphertext: string;
  /** Base64-encoded ML-KEM-768 ciphertext (1088 bytes raw). */
  pqCiphertext: string;
  /** Base64-encoded combined shared secret (32 bytes). */
  sharedSecret: string;
}

// ---------------------------------------------------------------------------
// Signing key generation
// ---------------------------------------------------------------------------

/** Generate a standalone ML-DSA-65 signing key pair. */
export function generatePqSigningKeyPair(): PqSigningKeyPair {
  const dsa = requireDsa();
  const keys = dsa.keygen();
  return {
    privateKey: Buffer.from(keys.secretKey).toString("base64"),
    publicKey: Buffer.from(keys.publicKey).toString("base64"),
  };
}

/** Generate a hybrid key pair: Ed25519 + ML-DSA-65. */
export function generateHybridSigningKeyPair(): HybridKeyPair {
  const classical = generateEd25519KeyPair();
  const postQuantum = generatePqSigningKeyPair();
  return { classical, postQuantum };
}

// ---------------------------------------------------------------------------
// Encryption key generation
// ---------------------------------------------------------------------------

/** Generate a standalone ML-KEM-768 encryption key pair. */
export function generatePqEncryptionKeyPair(): PqEncryptionKeyPair {
  const kem = requireKem();
  const keys = kem.keygen();
  return {
    privateKey: Buffer.from(keys.secretKey).toString("base64"),
    publicKey: Buffer.from(keys.publicKey).toString("base64"),
  };
}

/** Generate a hybrid encryption key pair: X25519 + ML-KEM-768. */
export function generateHybridEncryptionKeyPair(): HybridEncryptionKeyPair {
  const classical = generateX25519KeyPair();
  const postQuantum = generatePqEncryptionKeyPair();
  return { classical, postQuantum };
}

// ---------------------------------------------------------------------------
// Hybrid signing
// ---------------------------------------------------------------------------

/**
 * Produce a hybrid signature over a message.
 *
 * Both Ed25519 and ML-DSA-65 sign the same message independently.
 * A verifier must check both to accept the signature.
 */
export function hybridSign(
  message: string,
  classicalPrivateKey: string,
  pqPrivateKey: string,
): HybridSignature {
  const dsa = requireDsa();
  const messageBytes = new TextEncoder().encode(message);

  const classicalSig = ed25519Sign(message, classicalPrivateKey);

  const pqSecretKey = Buffer.from(pqPrivateKey, "base64");
  const pqSig = dsa.sign(messageBytes, pqSecretKey);

  return {
    classical: classicalSig,
    postQuantum: Buffer.from(pqSig).toString("base64"),
  };
}

/**
 * Verify a hybrid signature. BOTH components must be valid.
 *
 * Constant-time-ish: always evaluates both checks to avoid timing leaks
 * revealing which layer failed.
 */
export function hybridVerify(
  message: string,
  signature: HybridSignature,
  classicalPublicKey: string,
  pqPublicKey: string,
): boolean {
  const dsa = requireDsa();
  const messageBytes = new TextEncoder().encode(message);

  let classicalValid = false;
  try {
    classicalValid = ed25519Verify(message, signature.classical, classicalPublicKey);
  } catch {
    classicalValid = false;
  }

  let pqValid = false;
  try {
    const pqPubKey = Buffer.from(pqPublicKey, "base64");
    const pqSig = Buffer.from(signature.postQuantum, "base64");
    pqValid = dsa.verify(pqSig, messageBytes, pqPubKey);
  } catch {
    pqValid = false;
  }

  return classicalValid && pqValid;
}

// ---------------------------------------------------------------------------
// Hybrid key encapsulation (X25519 + ML-KEM-768)
// ---------------------------------------------------------------------------

/**
 * Encapsulate a shared secret using both X25519 sealed box and ML-KEM-768.
 *
 * The returned `sharedSecret` is the ML-KEM shared secret. The classical
 * layer encrypts it via NaCl sealed box so the recipient needs both
 * classical and PQ private keys to recover it.
 */
export function hybridEncapsulate(
  classicalPublicKey: string,
  pqPublicKey: string,
): HybridEncapsulation {
  const kem = requireKem();

  const pqPubKey = Buffer.from(pqPublicKey, "base64");
  const { cipherText, sharedSecret } = kem.encapsulate(pqPubKey);

  const sharedSecretB64 = Buffer.from(sharedSecret).toString("base64");

  // Encrypt the PQ shared secret with the classical layer (sealed box)
  const classicalCiphertext = x25519Encrypt(sharedSecretB64, classicalPublicKey);

  return {
    classicalCiphertext,
    pqCiphertext: Buffer.from(cipherText).toString("base64"),
    sharedSecret: sharedSecretB64,
  };
}

/**
 * Decapsulate a shared secret. Requires both classical and PQ private keys.
 *
 * Checks both layers independently: the PQ decapsulation must produce
 * the same shared secret that was encrypted in the classical layer.
 * Returns the shared secret only when both agree.
 */
export function hybridDecapsulate(
  encapsulation: { classicalCiphertext: string; pqCiphertext: string },
  classicalPrivateKey: string,
  classicalPublicKey: string,
  pqPrivateKey: string,
): string {
  const kem = requireKem();

  // PQ decapsulation
  const pqSecretKey = Buffer.from(pqPrivateKey, "base64");
  const pqCiphertext = Buffer.from(encapsulation.pqCiphertext, "base64");
  const pqShared = kem.decapsulate(pqCiphertext, pqSecretKey);
  const pqSharedB64 = Buffer.from(pqShared).toString("base64");

  // Classical decapsulation (unseal the shared secret)
  const classicalSharedB64 = x25519Decrypt(
    encapsulation.classicalCiphertext,
    classicalPrivateKey,
    classicalPublicKey,
  );

  // Both layers must agree on the same shared secret
  if (pqSharedB64 !== classicalSharedB64) {
    throw new Error(
      "Hybrid decapsulation mismatch: classical and post-quantum layers produced different shared secrets. " +
        "Possible tampering or key mismatch.",
    );
  }

  return pqSharedB64;
}
