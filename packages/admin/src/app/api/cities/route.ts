import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { cities } from '@ondc/shared';

export async function POST(request: NextRequest) {
  try {
    const { code, name, state } = await request.json();

    if (!code || !name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 });
    }

    const [created] = await db
      .insert(cities)
      .values({ code, name, state })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'City code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create city' }, { status: 500 });
  }
}
