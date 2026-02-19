import { requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const HEALTH_MONITOR_URL = process.env.HEALTH_MONITOR_URL || 'http://health-monitor:3008';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(HEALTH_MONITOR_URL, '/status');
}
