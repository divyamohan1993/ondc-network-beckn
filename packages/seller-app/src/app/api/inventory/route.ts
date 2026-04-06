import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-guard';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

export async function GET(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('provider_id');
    const lowStock = searchParams.get('filter') === 'low_stock';
    const endpoint = lowStock ? '/api/inventory/low-stock' : '/api/inventory';
    const url = providerId ? `${BPP_URL}${endpoint}?provider_id=${providerId}` : `${BPP_URL}${endpoint}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch inventory', details: [] } }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const { itemId, ...rest } = body;
    if (!itemId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'itemId is required', details: [] } }, { status: 400 });
    }
    const res = await fetch(`${BPP_URL}/api/inventory/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to update inventory', details: [] } }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const res = await fetch(`${BPP_URL}/api/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to bulk update inventory', details: [] } }, { status: 502 });
  }
}
