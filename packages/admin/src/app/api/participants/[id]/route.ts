import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { subscribers, participantCredentials } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

export async function GET(
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

    const creds = await db
      .select({
        id: participantCredentials.id,
        unique_key_id: participantCredentials.unique_key_id,
        signing_public_key: participantCredentials.signing_public_key,
        encryption_public_key: participantCredentials.encryption_public_key,
        is_active: participantCredentials.is_active,
        created_at: participantCredentials.created_at,
        revoked_at: participantCredentials.revoked_at,
      })
      .from(participantCredentials)
      .where(eq(participantCredentials.subscriber_id, participant.subscriber_id));

    return NextResponse.json({ participant, credentials: creds });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch participant" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ["org_name", "contact_email", "contact_phone", "webhook_url", "subscriber_url"];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date();

    const [updated] = await db
      .update(subscribers)
      .set(updates)
      .where(eq(subscribers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update participant" }, { status: 500 });
  }
}
