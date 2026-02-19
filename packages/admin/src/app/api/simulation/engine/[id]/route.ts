import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const SIMULATION_ENGINE_URL = process.env.SIMULATION_ENGINE_URL || 'http://simulation-engine:3011';

const ALLOWED_ACTIONS = ['pause', 'resume', 'cancel'];

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { id } = params;
  return proxyToService(SIMULATION_ENGINE_URL, `/simulations/${encodeURIComponent(id)}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { id } = params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { action } = body;

  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action: ${action}. Allowed: ${ALLOWED_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  return proxyToService(
    SIMULATION_ENGINE_URL,
    `/simulations/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
    { method: 'POST' },
  );
}
