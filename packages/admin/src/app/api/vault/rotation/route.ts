import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const VAULT_URL = process.env.VAULT_URL || 'http://vault:3006';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(VAULT_URL, '/rotation');
}

export async function POST() {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  return proxyToService(VAULT_URL, '/rotation', {
    method: 'POST',
  });
}
