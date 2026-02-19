import { ed25519 } from "@noble/curves/ed25519.js";

export interface Ed25519KeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Generate an Ed25519 key pair.
 * @returns Object with base64-encoded privateKey and publicKey.
 */
export function generateKeyPair(): Ed25519KeyPair {
  const privateKeyBytes = ed25519.utils.randomSecretKey();
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);

  return {
    privateKey: Buffer.from(privateKeyBytes).toString("base64"),
    publicKey: Buffer.from(publicKeyBytes).toString("base64"),
  };
}

/**
 * Sign a message using Ed25519.
 * @param message - The plaintext message to sign.
 * @param privateKeyBase64 - Base64-encoded 32-byte private key.
 * @returns Base64-encoded signature.
 */
export function sign(message: string, privateKeyBase64: string): string {
  const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
  const messageBytes = new TextEncoder().encode(message);
  const signature = ed25519.sign(messageBytes, privateKeyBytes);
  return Buffer.from(signature).toString("base64");
}

/**
 * Verify an Ed25519 signature.
 * @param message - The original plaintext message.
 * @param signatureBase64 - Base64-encoded signature.
 * @param publicKeyBase64 - Base64-encoded 32-byte public key.
 * @returns True if the signature is valid.
 */
export function verify(
  message: string,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  const messageBytes = new TextEncoder().encode(message);
  return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
}
