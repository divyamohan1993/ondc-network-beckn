import { NextRequest, NextResponse } from 'next/server';
import { requireRole, proxyToService, unauthorized } from '@/lib/api-helpers';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:3007';

const ALLOWED_ACTIONS = ['start', 'stop', 'restart'];

export async function POST(
  request: NextRequest,
  { params }: { params: { name: string; action: string } },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { name, action } = params;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action: ${action}. Allowed: ${ALLOWED_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  return proxyToService(ORCHESTRATOR_URL, `/services/${encodeURIComponent(name)}/${encodeURIComponent(action)}`, {
    method: 'POST',
  });
}
