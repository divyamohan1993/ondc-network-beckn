import { NextRequest } from 'next/server';
import { requireRole, proxyToService, unauthorized } from '@/lib/api-helpers';

const VAULT_URL = process.env.VAULT_URL || 'http://vault:3006';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { name } = await params;
  return proxyToService(VAULT_URL, `/secrets/${encodeURIComponent(name)}/rotate`, {
    method: 'POST',
  });
}
