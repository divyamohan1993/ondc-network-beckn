import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireAuth, proxyToService, unauthorized } from '@/lib/api-helpers';

const VAULT_URL = process.env.VAULT_URL || 'http://vault:3006';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  return proxyToService(VAULT_URL, '/secrets');
}

export async function POST(request: NextRequest) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  let body: { name?: string; value?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.name || !body.value) {
    return NextResponse.json(
      { error: 'Secret name and value are required' },
      { status: 400 },
    );
  }

  return proxyToService(VAULT_URL, '/secrets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
