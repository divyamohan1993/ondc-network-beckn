import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { simulationRuns } from '@ondc/shared';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();

    const [run] = await db
      .insert(simulationRuns)
      .values({
        config,
        status: 'RUNNING',
      })
      .returning();

    // In a real implementation, this would trigger the simulation engine.
    // For now we'll mark it as completed after creating the record.
    // The actual simulation would be handled by a separate worker/service.

    // Simulate completion after a brief delay
    setTimeout(async () => {
      try {
        await db
          .update(simulationRuns)
          .set({
            status: 'COMPLETED',
            completed_at: new Date(),
            stats: {
              participants_created: (config.baps || 0) + (config.bpps || 0),
              transactions_generated: config.orders || 0,
              domains_used: config.domains?.length || 0,
            },
          })
          .where(eq(simulationRuns.id, run.id));
      } catch {
        // ignore
      }
    }, 2000);

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to start simulation' }, { status: 500 });
  }
}
