import type { NextRequest } from "next/server";

/**
 * Client IP behind a trusted reverse proxy (Traefik).
 * Uses the left-most X-Forwarded-For hop (original client) when present.
 * Only safe when the app is not reachable without that proxy.
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "0.0.0.0";
}

export function getClientIp(request: NextRequest | Request): string {
  return getClientIpFromHeaders(request.headers);
}

export function getUserAgent(request: NextRequest | Request): string {
  return request.headers.get("user-agent") ?? "";
}
