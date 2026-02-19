import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';

const ROLE_HIERARCHY: Role[] = ['VIEWER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * Check session and validate user has the required role (or higher).
 * Returns the session on success, or null if unauthorized.
 */
export async function requireRole(requiredRole: Role) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const userRole = (session.user as any)?.role as Role | undefined;
  if (!userRole) return null;

  const requiredIdx = ROLE_HIERARCHY.indexOf(requiredRole);
  const userIdx = ROLE_HIERARCHY.indexOf(userRole);

  if (userIdx < requiredIdx) return null;
  return session;
}

/**
 * Check that a valid session exists (any authenticated user).
 * Returns the session on success, or null if not authenticated.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  return session ?? null;
}

/**
 * Proxy a request to an internal micro-service, forwarding the internal API key.
 */
export async function proxyToService(
  serviceUrl: string,
  path: string,
  options?: RequestInit,
) {
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

  try {
    const res = await fetch(`${serviceUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
        ...options?.headers,
      },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'Service unavailable', details: String(err) },
      { status: 503 },
    );
  }
}

/**
 * Return a standard 401 Unauthorized response.
 */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Return a standard 403 Forbidden response.
 */
export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
