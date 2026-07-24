import { type NextRequest, NextResponse } from "next/server";

import { publicErrorBody } from "@/lib/http/public-error";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import {
  buildWhatsappDestinationUrl,
  bumpTrackedLinkClick,
  ensureVisitorForRedirect,
  getTrackedLinkBySlug,
} from "@/lib/tracking/tracked-links";

export const runtime = "nodejs";

const COOKIE_DAYS = 365;

function readCookie(request: NextRequest, name: string): string | null {
  return request.cookies.get(name)?.value ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(request);
  const limited = rateLimit(`redirect:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(publicErrorBody("rate_limited"), { status: 429 });
  }

  const { slug } = await context.params;
  const cleanSlug = (slug || "").trim().toLowerCase();
  if (!cleanSlug || cleanSlug.length > 64) {
    return NextResponse.json(publicErrorBody("not_found"), { status: 404 });
  }

  const link = await getTrackedLinkBySlug(cleanSlug);
  if (!link) {
    return NextResponse.json(publicErrorBody("not_found"), { status: 404 });
  }

  const existing =
    readCookie(request, "trck_user_id") ||
    request.nextUrl.searchParams.get("trck_user_id");

  const { trckUserId, ticketCode } = await ensureVisitorForRedirect({
    existingTrckUserId: existing,
    link,
    ip,
    userAgent: getUserAgent(request),
  });

  await bumpTrackedLinkClick(link.id);

  const dest = buildWhatsappDestinationUrl(link, ticketCode);
  const res = NextResponse.redirect(dest, 302);
  const maxAge = COOKIE_DAYS * 24 * 60 * 60;
  res.cookies.set("trck_user_id", trckUserId, {
    path: "/",
    maxAge,
    sameSite: "lax",
  });
  res.cookies.set("trck_ticket_code", ticketCode, {
    path: "/",
    maxAge,
    sameSite: "lax",
  });
  return res;
}
