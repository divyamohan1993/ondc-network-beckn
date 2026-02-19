import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers } from '@ondc/shared';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { status } = await request.json();

    const validStatuses = ['INITIATED', 'UNDER_SUBSCRIPTION', 'SUBSCRIBED', 'SUSPENDED', 'REVOKED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    await db
      .update(subscribers)
      .set({ status, updated_at: new Date() })
      .where(eq(subscribers.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
