import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:3007';

const ALLOWED_TEARDOWN_TYPES = ['soft', 'hard', 'full', 'reset'] as const;
type TeardownType = (typeof ALLOWED_TEARDOWN_TYPES)[number];

export async function POST(request: NextRequest) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  let body: { type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { type } = body;

  if (!type || !ALLOWED_TEARDOWN_TYPES.includes(type as TeardownType)) {
    return NextResponse.json(
      {
        error: `Invalid teardown type: ${type}. Allowed: ${ALLOWED_TEARDOWN_TYPES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  return proxyToService(ORCHESTRATOR_URL, `/teardown/${encodeURIComponent(type)}`, {
    method: 'POST',
  });
}

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(ORCHESTRATOR_URL, '/teardown/status');
}
