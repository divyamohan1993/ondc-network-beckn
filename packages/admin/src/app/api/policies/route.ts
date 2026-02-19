import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { networkPolicies } from '@ondc/shared';

export async function POST(request: NextRequest) {
  try {
    const { key, value, domain, description } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }

    const [created] = await db
      .insert(networkPolicies)
      .values({ key, value, domain, description })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 });
  }
}
