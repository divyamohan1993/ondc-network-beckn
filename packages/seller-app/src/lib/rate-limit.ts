/**
 * In-memory rate limiter for Next.js API routes.
 * Uses a Map with automatic cleanup of expired entries.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

let cleanupScheduled = false;
function scheduleCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000).unref();
}

/**
 * Check if a request from the given IP is within rate limits.
 *
 * @param ip - Client IP address.
 * @param maxRequests - Max requests per window (default 60).
 * @param windowMs - Window duration in ms (default 60000 = 1 minute).
 * @returns true if allowed, false if rate limited.
 */
export function checkRateLimit(
  ip: string,
  maxRequests = 60,
  windowMs = 60_000,
): boolean {
  scheduleCleanup();

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/**
 * Get remaining requests and reset time for an IP.
 */
export function getRateLimitInfo(
  ip: string,
  maxRequests = 60,
): { remaining: number; resetAt: number } {
  const entry = store.get(ip);
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    return { remaining: maxRequests, resetAt: now + 60_000 };
  }

  return {
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}
