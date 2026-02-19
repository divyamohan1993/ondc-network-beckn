import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { networkPolicies } from '@ondc/shared';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();

    await db
      .update(networkPolicies)
      .set({ ...body, updated_at: new Date() })
      .where(eq(networkPolicies.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update policy' }, { status: 500 });
  }
}
