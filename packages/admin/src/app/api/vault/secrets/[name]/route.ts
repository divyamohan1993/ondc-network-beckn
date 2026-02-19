import { NextRequest, NextResponse } from 'next/server';
import { requireRole, proxyToService, unauthorized } from '@/lib/api-helpers';

const VAULT_URL = process.env.VAULT_URL || 'http://vault:3006';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { name } = await params;
  return proxyToService(VAULT_URL, `/secrets/${encodeURIComponent(name)}`);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { name } = await params;

  let body: { value?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.value) {
    return NextResponse.json(
      { error: 'Secret value is required' },
      { status: 400 },
    );
  }

  return proxyToService(VAULT_URL, `/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await requireRole('SUPER_ADMIN');
  if (!session) {
    return unauthorized();
  }

  const { name } = await params;
  return proxyToService(VAULT_URL, `/secrets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}
