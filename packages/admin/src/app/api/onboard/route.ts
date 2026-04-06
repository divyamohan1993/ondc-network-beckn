import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateKeyPair, generateEncryptionKeyPair } from "@ondc/shared";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { cities, domains, subscribers, participantCredentials } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

const TYPE_MAP: Record<string, "BAP" | "BPP"> = {
  buyer: "BAP",
  seller: "BPP",
};

function validateGSTIN(gstin: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
    return false;
  }
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const idx = chars.indexOf(gstin[i]);
    let val = idx;
    if (i % 2 === 1) {
      val = Math.floor((idx * 2) / 36) + ((idx * 2) % 36);
    }
    sum += val;
  }
  const checkDigit = (36 - (sum % 36)) % 36;
  return chars[checkDigit] === gstin[14];
}

function buildEnvVars(
  prefix: "BAP" | "BPP",
  subscriberId: string,
  subscriberUrl: string,
  signingKeys: { privateKey: string; publicKey: string },
  encryptionKeys: { privateKey: string; publicKey: string },
  uniqueKeyId: string,
  domain: string,
  primaryDomain: string,
  primaryCity: string,
): Record<string, string> {
  return {
    [`${prefix}_ID`]: subscriberId,
    [`${prefix}_URI`]: subscriberUrl,
    [`${prefix}_PRIVATE_KEY`]: signingKeys.privateKey,
    [`${prefix}_PUBLIC_KEY`]: signingKeys.publicKey,
    [`${prefix}_UNIQUE_KEY_ID`]: uniqueKeyId,
    [`${prefix}_ENCRYPTION_PRIVATE_KEY`]: encryptionKeys.privateKey,
    [`${prefix}_ENCRYPTION_PUBLIC_KEY`]: encryptionKeys.publicKey,
    REGISTRY_URL: `https://${domain}/registry`,
    GATEWAY_URL: `https://${domain}/gateway`,
    BECKN_CORE_VERSION: "1.1.0",
    BECKN_COUNTRY: "IND",
    BECKN_TTL: "PT30S",
    ONDC_DOMAIN: primaryDomain,
    ONDC_CITY: primaryCity,
  };
}

async function createParticipant(
  body: Record<string, any>,
  participantType: "BAP" | "BPP",
  DOMAIN: string,
  REGISTRY_URL: string,
) {
  const signingKeys = generateKeyPair();
  const encryptionKeys = generateEncryptionKeyPair();
  const uniqueKeyId = `key-${randomUUID().slice(0, 8)}`;
  const prefix = participantType;
  const primaryDomain = body.domains?.[0] || "ONDC:RET10";
  const primaryCity = body.cities?.[0] || "std:080";

  const subscribePayload = {
    subscriber_id: body.subscriber_id,
    subscriber_url: body.subscriber_url,
    type: participantType === "BAP" ? "buyerApp" : "sellerApp",
    domain: primaryDomain,
    city: primaryCity,
    signing_public_key: signingKeys.publicKey,
    encr_public_key: encryptionKeys.publicKey,
    unique_key_id: uniqueKeyId,
  };

  let subscribeResult: Record<string, unknown> = {};
  try {
    const res = await fetch(`${REGISTRY_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscribePayload),
    });
    subscribeResult = await res.json();
  } catch {
    subscribeResult = { status: "INITIATED", note: "Registry call failed, credentials generated locally." };
  }

  // For "both" type, append suffix to subscriber_id
  const subscriberId = body.subscriber_id;

  // Persist subscriber to database
  await db
    .insert(subscribers)
    .values({
      subscriber_id: subscriberId,
      subscriber_url: body.subscriber_url,
      type: participantType,
      domain: primaryDomain,
      city: primaryCity,
      signing_public_key: signingKeys.publicKey,
      encr_public_key: encryptionKeys.publicKey,
      unique_key_id: uniqueKeyId,
      status: "INITIATED",
      org_name: body.org_name,
      gst_number: body.gst_number,
      pan_number: body.pan_number,
      signatory_name: body.signatory_name,
      contact_email: body.email,
      contact_phone: body.phone,
      callback_url: body.callback_url,
    })
    .onConflictDoUpdate({
      target: subscribers.subscriber_id,
      set: {
        subscriber_url: body.subscriber_url,
        type: participantType,
        domain: primaryDomain,
        city: primaryCity,
        signing_public_key: signingKeys.publicKey,
        encr_public_key: encryptionKeys.publicKey,
        unique_key_id: uniqueKeyId,
        org_name: body.org_name,
        gst_number: body.gst_number,
        pan_number: body.pan_number,
        signatory_name: body.signatory_name,
        contact_email: body.email,
        contact_phone: body.phone,
        callback_url: body.callback_url,
        updated_at: new Date(),
      },
    });

  const envVars = buildEnvVars(
    prefix,
    subscriberId,
    body.subscriber_url,
    signingKeys,
    encryptionKeys,
    uniqueKeyId,
    DOMAIN,
    primaryDomain,
    primaryCity,
  );

  // Save credentials
  await db.insert(participantCredentials).values({
    subscriber_id: subscriberId,
    signing_private_key: signingKeys.privateKey,
    signing_public_key: signingKeys.publicKey,
    encryption_private_key: encryptionKeys.privateKey,
    encryption_public_key: encryptionKeys.publicKey,
    unique_key_id: uniqueKeyId,
    env_blob: envVars,
  });

  return {
    subscriber_id: subscriberId,
    subscriber_url: body.subscriber_url,
    unique_key_id: uniqueKeyId,
    type: participantType,
    type_label: participantType === "BAP" ? "Buyer App" : "Seller App",
    org_name: body.org_name,
    generated_at: new Date().toISOString(),
    signing_private_key: signingKeys.privateKey,
    signing_public_key: signingKeys.publicKey,
    encryption_private_key: encryptionKeys.privateKey,
    encryption_public_key: encryptionKeys.publicKey,
    registry_url: `https://${DOMAIN}/registry`,
    gateway_url: `https://${DOMAIN}/gateway`,
    site_verification_id: randomUUID(),
    env_vars: envVars,
    subscribe_result: subscribeResult,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subscriberId = searchParams.get("subscriber_id");

  if (subscriberId) {
    // Retrieve stored credentials for an existing participant
    const session = await requireRole("ADMIN");
    if (!session) return unauthorized();

    const creds = await db
      .select()
      .from(participantCredentials)
      .where(eq(participantCredentials.subscriber_id, subscriberId));

    if (creds.length === 0) {
      return NextResponse.json({ error: "No credentials found for this subscriber" }, { status: 404 });
    }

    return NextResponse.json({ credentials: creds });
  }

  // Default: return cities and domains for the onboarding form
  const [cityRows, domainRows] = await Promise.all([
    db.select({ code: cities.code, name: cities.name, state: cities.state }).from(cities).where(eq(cities.is_active, true)),
    db.select({ code: domains.code, name: domains.name }).from(domains).where(eq(domains.is_active, true)),
  ]);
  return NextResponse.json({ cities: cityRows, domains: domainRows });
}

export async function POST(request: Request) {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const body = await request.json();

    const required = ["org_name", "participant_type", "subscriber_id", "subscriber_url", "gst_number", "pan_number", "signatory_name", "email", "phone"];
    const missing = required.filter((f) => !body[f]);
    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
    }

    if (!validateGSTIN(body.gst_number)) {
      return NextResponse.json({ success: false, error: "Invalid GSTIN. Check the format and checksum." }, { status: 400 });
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(body.pan_number)) {
      return NextResponse.json({ success: false, error: "Invalid PAN format. Expected: ABCDE1234F" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ success: false, error: "Invalid email address." }, { status: 400 });
    }

    const phoneRegex = /^[+]?[0-9]{10,15}$/;
    if (!phoneRegex.test(body.phone.replace(/[\s-]/g, ""))) {
      return NextResponse.json({ success: false, error: "Invalid phone number." }, { status: 400 });
    }

    const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:3001";
    const DOMAIN = process.env.DOMAIN || "ondc.dmj.one";

    if (body.participant_type === "both") {
      // Create both BAP and BPP subscribers
      const bapBody = { ...body, subscriber_id: `${body.subscriber_id}.bap` };
      const bppBody = { ...body, subscriber_id: `${body.subscriber_id}.bpp` };

      const [bapCreds, bppCreds] = await Promise.all([
        createParticipant(bapBody, "BAP", DOMAIN, REGISTRY_URL),
        createParticipant(bppBody, "BPP", DOMAIN, REGISTRY_URL),
      ]);

      return NextResponse.json({
        success: true,
        credentials: { bap: bapCreds, bpp: bppCreds },
      });
    }

    const participantType = TYPE_MAP[body.participant_type] || "BPP";
    const credentials = await createParticipant(body, participantType, DOMAIN, REGISTRY_URL);

    return NextResponse.json({ success: true, credentials });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
