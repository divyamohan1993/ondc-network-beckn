import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const SIMULATION_ENGINE_URL = process.env.SIMULATION_ENGINE_URL || 'http://simulation-engine:3011';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(SIMULATION_ENGINE_URL, '/simulations');
}

export async function POST(request: NextRequest) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  return proxyToService(SIMULATION_ENGINE_URL, '/simulations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
