import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitInfo } from "./rate-limit";

/**
 * Validates Origin/Content-Type headers for CSRF protection and enforces rate limits.
 * Returns a NextResponse error if the request should be blocked, or null if it should proceed.
 */
export function guardApiRoute(
  request: NextRequest,
  options?: { maxRequests?: number; windowMs?: number },
): NextResponse | null {
  const maxRequests = options?.maxRequests ?? 60;
  const windowMs = options?.windowMs ?? 60_000;

  // Rate limit check
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip, maxRequests, windowMs)) {
    const info = getRateLimitInfo(ip, maxRequests);
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
          details: [],
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((info.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // CSRF protection: verify Origin header matches for mutating requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            {
              error: {
                code: "CSRF_REJECTED",
                message: "Cross-origin request blocked.",
                details: [],
              },
            },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "CSRF_REJECTED",
              message: "Invalid origin header.",
              details: [],
            },
          },
          { status: 403 },
        );
      }
    }

    // Require JSON content type for POST/PUT/PATCH/DELETE
    const contentType = request.headers.get("content-type") ?? "";
    if (
      request.method !== "DELETE" &&
      !contentType.includes("application/json") &&
      !contentType.includes("multipart/form-data")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CONTENT_TYPE",
            message: "Content-Type must be application/json or multipart/form-data.",
            details: [],
          },
        },
        { status: 415 },
      );
    }
  }

  return null;
}
