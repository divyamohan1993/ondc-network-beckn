import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-guard';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

export async function POST(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'file is required', details: [] } },
        { status: 400 },
      );
    }

    // Forward to BPP upload endpoint
    const bppFormData = new FormData();
    bppFormData.append('file', file);

    const res = await fetch(`${BPP_URL}/api/upload`, {
      method: 'POST',
      body: bppFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: { code: 'UPLOAD_FAILED', message: `Upload failed: ${errorText}`, details: [] } },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_ERROR', message: 'Failed to upload image', details: [] } },
      { status: 502 },
    );
  }
}
