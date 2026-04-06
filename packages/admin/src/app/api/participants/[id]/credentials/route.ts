import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import db from "@/lib/db";
import { subscribers, participantCredentials, generateKeyPair, generateEncryptionKeyPair } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    // Look up subscriber by UUID id to get subscriber_id
    const [subscriber] = await db
      .select({ subscriber_id: subscribers.subscriber_id })
      .from(subscribers)
      .where(eq(subscribers.id, id));

    if (!subscriber) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    const creds = await db
      .select()
      .from(participantCredentials)
      .where(
        and(
          eq(participantCredentials.subscriber_id, subscriber.subscriber_id),
          eq(participantCredentials.is_active, true),
        ),
      );

    return NextResponse.json({ credentials: creds });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    const [participant] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, id));

    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    // Revoke existing active credentials
    await db
      .update(participantCredentials)
      .set({ is_active: false, revoked_at: new Date() })
      .where(
        and(
          eq(participantCredentials.subscriber_id, participant.subscriber_id),
          eq(participantCredentials.is_active, true),
        ),
      );

    const signingKeys = generateKeyPair();
    const encryptionKeys = generateEncryptionKeyPair();
    const uniqueKeyId = `key-${randomUUID().slice(0, 8)}`;

    const prefix = participant.type === "BAP" ? "BAP" : "BPP";
    const DOMAIN = process.env.DOMAIN || "ondc.dmj.one";

    const envBlob: Record<string, string> = {
      [`${prefix}_ID`]: participant.subscriber_id,
      [`${prefix}_URI`]: participant.subscriber_url ?? "",
      [`${prefix}_PRIVATE_KEY`]: signingKeys.privateKey,
      [`${prefix}_UNIQUE_KEY_ID`]: uniqueKeyId,
      REGISTRY_URL: `https://${DOMAIN}/registry`,
      GATEWAY_URL: `https://${DOMAIN}/gateway`,
    };

    const [cred] = await db
      .insert(participantCredentials)
      .values({
        subscriber_id: participant.subscriber_id,
        signing_private_key: signingKeys.privateKey,
        signing_public_key: signingKeys.publicKey,
        encryption_private_key: encryptionKeys.privateKey,
        encryption_public_key: encryptionKeys.publicKey,
        unique_key_id: uniqueKeyId,
        env_blob: envBlob,
      })
      .returning();

    return NextResponse.json({ credentials: [cred] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate credentials" }, { status: 500 });
  }
}
