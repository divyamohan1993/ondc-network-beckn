import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import db from '@/lib/db';
import { simulationRuns } from '@ondc/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(simulationRuns)
      .orderBy(sql`started_at DESC`)
      .limit(50);

    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json([], { status: 200 });
  }
}
