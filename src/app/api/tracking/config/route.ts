import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { publicErrorBody } from "@/lib/http/public-error";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/tracking/request";
import { TICKET_PREFIX } from "@/lib/whatsapp/ticket";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

/** Public ticket prefix for WhatsApp wa.me patching (fixed). */
export async function GET(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`tracking-config:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return jsonCors(publicErrorBody("rate_limited"), { status: 429 }, request);
  }

  return jsonCors({ ticket_prefix: TICKET_PREFIX }, undefined, request);
}
