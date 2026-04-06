import { NextRequest, NextResponse } from 'next/server';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

export async function GET() {
  try {
    const res = await fetch(`${BPP_URL}/api/orders`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch orders', details: [] } }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id, ...rest } = body;
    if (!order_id) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'order_id is required', details: [] } }, { status: 400 });
    }
    const res = await fetch(`${BPP_URL}/api/fulfill/${order_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to update order', details: [] } }, { status: 502 });
  }
}
