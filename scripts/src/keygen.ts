import { Command } from "commander";
import * as ed from "@noble/ed25519";
import { edwardsToMontgomeryPub, edwardsToMontgomeryPriv } from "@noble/curves/ed25519";
import { randomBytes } from "node:crypto";
import { sha512 } from "@noble/hashes/sha512";

// ed25519 v2 requires providing a sha-512 implementation
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

interface KeygenOptions {
  subscriberId?: string;
  uniqueKeyId?: string;
  output: "json" | "env" | "text";
}

async function generateKeys(opts: KeygenOptions) {
  const subscriberId =
    opts.subscriberId ?? `subscriber-${Date.now()}`;
  const uniqueKeyId =
    opts.uniqueKeyId ?? `key-${randomBytes(4).toString("hex")}`;

  // -----------------------------------------------------------------------
  // Ed25519 signing key pair
  // -----------------------------------------------------------------------
  const signingPrivateKeyBytes = ed.utils.randomPrivateKey();
  const signingPublicKeyBytes = await ed.getPublicKeyAsync(signingPrivateKeyBytes);

  const signingPrivateKey = Buffer.from(signingPrivateKeyBytes).toString("base64");
  const signingPublicKey = Buffer.from(signingPublicKeyBytes).toString("base64");

  // -----------------------------------------------------------------------
  // X25519 encryption key pair (derived via Edwards -> Montgomery conversion)
  // -----------------------------------------------------------------------
  const encrPrivateKeyBytes = edwardsToMontgomeryPriv(signingPrivateKeyBytes);
  const encrPublicKeyBytes = edwardsToMontgomeryPub(signingPublicKeyBytes);

  const encrPrivateKey = Buffer.from(encrPrivateKeyBytes).toString("base64");
  const encrPublicKey = Buffer.from(encrPublicKeyBytes).toString("base64");

  // -----------------------------------------------------------------------
  // Output
  // -----------------------------------------------------------------------
  const result = {
    subscriber_id: subscriberId,
    unique_key_id: uniqueKeyId,
    signing_public_key: signingPublicKey,
    signing_private_key: signingPrivateKey,
    encr_public_key: encrPublicKey,
    encr_private_key: encrPrivateKey,
  };

  switch (opts.output) {
    case "json":
      console.log(JSON.stringify(result, null, 2));
      break;

    case "env":
      console.log(`SUBSCRIBER_ID=${result.subscriber_id}`);
      console.log(`UNIQUE_KEY_ID=${result.unique_key_id}`);
      console.log(`SIGNING_PUBLIC_KEY=${result.signing_public_key}`);
      console.log(`SIGNING_PRIVATE_KEY=${result.signing_private_key}`);
      console.log(`ENCR_PUBLIC_KEY=${result.encr_public_key}`);
      console.log(`ENCR_PRIVATE_KEY=${result.encr_private_key}`);
      break;

    case "text":
    default:
      console.log("=== ONDC Key Pair ===\n");
      console.log(`Subscriber ID       : ${result.subscriber_id}`);
      console.log(`Unique Key ID       : ${result.unique_key_id}`);
      console.log(`Signing Public Key  : ${result.signing_public_key}`);
      console.log(`Signing Private Key : ${result.signing_private_key}`);
      console.log(`Encrypt Public Key  : ${result.encr_public_key}`);
      console.log(`Encrypt Private Key : ${result.encr_private_key}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("keygen")
  .description("Generate Ed25519 signing & X25519 encryption key pairs for ONDC network participants")
  .option("--subscriber-id <id>", "Subscriber ID to embed in output")
  .option("--unique-key-id <id>", "Unique key ID to embed in output")
  .option(
    "--output <format>",
    "Output format: json | env | text",
    "text",
  )
  .action(async (opts) => {
    await generateKeys({
      subscriberId: opts.subscriberId,
      uniqueKeyId: opts.uniqueKeyId,
      output: opts.output as KeygenOptions["output"],
    });
  });

program.parse();
