import { NextRequest } from 'next/server';
import { requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const HEALTH_MONITOR_URL = process.env.HEALTH_MONITOR_URL || 'http://health-monitor:3008';

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const path = queryString ? `/metrics?${queryString}` : '/metrics';

  return proxyToService(HEALTH_MONITOR_URL, path);
}
