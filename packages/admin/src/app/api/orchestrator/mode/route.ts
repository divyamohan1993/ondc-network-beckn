import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:3007';

const ALLOWED_MODES = ['production', 'development'] as const;
type Mode = (typeof ALLOWED_MODES)[number];

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(ORCHESTRATOR_URL, '/mode');
}

export async function POST(request: NextRequest) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { mode } = body;

  if (!mode || !ALLOWED_MODES.includes(mode as Mode)) {
    return NextResponse.json(
      { error: `Invalid mode: ${mode}. Allowed: ${ALLOWED_MODES.join(', ')}` },
      { status: 400 },
    );
  }

  return proxyToService(ORCHESTRATOR_URL, '/mode', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}
