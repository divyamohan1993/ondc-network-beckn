import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const start = Date.now();
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    const responseTime = Date.now() - start;

    if (res.ok) {
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Not JSON response, but still OK
      }

      return NextResponse.json({
        ok: true,
        responseTime,
        uptime: data.uptime ?? 'N/A',
      });
    }

    return NextResponse.json({
      ok: false,
      responseTime,
      status: res.status,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Service unreachable',
    });
  }
}
