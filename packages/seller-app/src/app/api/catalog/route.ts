import { NextRequest, NextResponse } from 'next/server';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

export async function GET() {
  try {
    const res = await fetch(`${BPP_URL}/api/catalog`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch catalog', details: [] } }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BPP_URL}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to save catalog', details: [] } }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    if (!itemId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'itemId is required', details: [] } }, { status: 400 });
    }
    const body = await request.json();
    const res = await fetch(`${BPP_URL}/api/catalog/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to update item', details: [] } }, { status: 502 });
  }
}
