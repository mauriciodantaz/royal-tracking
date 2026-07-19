import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { getProjectName } from "@/lib/env";
import { slugTicketName } from "@/lib/whatsapp/ticket";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

/** Public ticket name for WhatsApp wa.me patching (no secrets). */
export async function GET(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ticketName = slugTicketName(
    process.env.TRCK_TICKET_NAME || getProjectName() || "rt"
  );

  return jsonCors({ ticket_name: ticketName }, undefined, request);
}
