import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:3007';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/services`, {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Orchestrator unavailable', details: String(err) },
      { status: 503 },
    );
  }
}
