import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const HEALTH_MONITOR_URL = process.env.HEALTH_MONITOR_URL || 'http://health-monitor:3008';

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const path = queryString ? `/alerts?${queryString}` : '/alerts';

  return proxyToService(HEALTH_MONITOR_URL, path);
}

export async function POST(request: NextRequest) {
  // Acknowledge an alert - requires ADMIN or SUPER_ADMIN
  const session = await requireRole('ADMIN');
  if (!session) {
    return unauthorized();
  }

  let body: { alertId?: string; acknowledged?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.alertId) {
    return NextResponse.json(
      { error: 'alertId is required' },
      { status: 400 },
    );
  }

  return proxyToService(HEALTH_MONITOR_URL, '/alerts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
