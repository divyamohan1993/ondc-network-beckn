import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import db from '@/lib/db';
import { domains } from '@ondc/shared';

/**
 * GET /api/domains - List all registered ONDC domains.
 */
export async function GET() {
  try {
    const data = await db
      .select()
      .from(domains)
      .orderBy(desc(domains.created_at));

    return NextResponse.json({ domains: data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code, name, description } = await request.json();

    if (!code || !name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 });
    }

    const [created] = await db
      .insert(domains)
      .values({ code, name, description })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Domain code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create domain' }, { status: 500 });
  }
}
