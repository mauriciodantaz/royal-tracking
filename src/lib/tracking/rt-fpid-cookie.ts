import type { NextResponse } from "next/server";

import { RT_FPID_COOKIE } from "@/lib/tracking/ga-client-id";

const MAX_AGE_SEC = 34_128_000; // ~395 days

export function readRtFpidFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== RT_FPID_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function appendRtFpidCookie(
  response: NextResponse,
  clientId: string
): void {
  const domain = process.env.GA_FPID_COOKIE_DOMAIN?.trim() || undefined;
  response.cookies.set(RT_FPID_COOKIE, clientId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  });
}
