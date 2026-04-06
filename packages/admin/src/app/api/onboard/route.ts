import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateKeyPair, generateEncryptionKeyPair } from "@ondc/shared";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { cities, domains } from "@ondc/shared";

const TYPE_MAP: Record<string, "BAP" | "BPP"> = {
  buyer: "BAP",
  seller: "BPP",
  both: "BAP",
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

export async function GET() {
  const [cityRows, domainRows] = await Promise.all([
    db.select({ code: cities.code, name: cities.name, state: cities.state }).from(cities).where(eq(cities.is_active, true)),
    db.select({ code: domains.code, name: domains.name }).from(domains).where(eq(domains.is_active, true)),
  ]);
  return NextResponse.json({ cities: cityRows, domains: domainRows });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
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

    // Generate keys
    const signingKeys = generateKeyPair();
    const encryptionKeys = generateEncryptionKeyPair();
    const uniqueKeyId = `key-${randomUUID().slice(0, 8)}`;

    const participantType = TYPE_MAP[body.participant_type] || "BPP";

    // Call registry /subscribe
    const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:3001";
    const subscribePayload = {
      subscriber_id: body.subscriber_id,
      subscriber_url: body.subscriber_url,
      type: participantType === "BAP" ? "buyerApp" : "sellerApp",
      domain: body.domains?.[0] || "ONDC:RET10",
      city: body.cities?.[0] || "std:080",
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
    } catch (registryErr) {
      // Registry may be unavailable in dev. Continue with key generation.
      subscribeResult = { status: "INITIATED", note: "Registry call failed, credentials generated locally." };
    }

    const DOMAIN = process.env.DOMAIN || "ondc.dmj.one";
    const prefix = participantType === "BAP" ? "BAP" : "BPP";

    // Generate site verification content
    const siteVerificationId = randomUUID();

    return NextResponse.json({
      success: true,
      credentials: {
        subscriber_id: body.subscriber_id,
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
        site_verification_id: siteVerificationId,
        env_vars: {
          [`${prefix}_ID`]: body.subscriber_id,
          [`${prefix}_URI`]: body.subscriber_url,
          [`${prefix}_PRIVATE_KEY`]: signingKeys.privateKey,
          [`${prefix}_UNIQUE_KEY_ID`]: uniqueKeyId,
          REGISTRY_URL: `https://${DOMAIN}/registry`,
          GATEWAY_URL: `https://${DOMAIN}/gateway`,
        },
        subscribe_result: subscribeResult,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
