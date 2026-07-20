import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { TICKET_PREFIX } from "@/lib/whatsapp/ticket";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

/** Public ticket prefix for WhatsApp wa.me patching (fixed). */
export async function GET(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  return jsonCors({ ticket_prefix: TICKET_PREFIX }, undefined, request);
}
