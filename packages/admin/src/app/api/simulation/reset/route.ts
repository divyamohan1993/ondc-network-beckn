import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers, transactions, simulationRuns } from '@ondc/shared';

export async function POST() {
  try {
    // Delete simulated transactions
    await db
      .delete(transactions)
      .where(eq(transactions.is_simulated, true));

    // Delete simulated subscribers
    await db
      .delete(subscribers)
      .where(eq(subscribers.is_simulated, true));

    // Clear simulation runs
    await db.delete(simulationRuns);

    return NextResponse.json({
      success: true,
      message: 'All simulated data has been reset',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset simulated data' }, { status: 500 });
  }
}
