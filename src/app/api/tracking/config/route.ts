import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { publicErrorBody } from "@/lib/http/public-error";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/tracking/request";
import {
  loadSnippetSettings,
  publicSnippetConfig,
} from "@/lib/tracking/snippet-config";
import { TICKET_PREFIX } from "@/lib/whatsapp/ticket";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

/** Public snippet runtime config (ticket prefix, rules, discovery flags). */
export async function GET(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`tracking-config:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return jsonCors(publicErrorBody("rate_limited"), { status: 429 }, request);
  }

  try {
    await ensureDbReady();
    const settings = await loadSnippetSettings();
    return jsonCors(
      publicSnippetConfig(settings, TICKET_PREFIX),
      undefined,
      request
    );
  } catch {
    return jsonCors(
      publicSnippetConfig(
        {
          rules: [],
          url_preserve_params: [],
          auto_ecommerce: false,
          listen_datalayer: false,
        },
        TICKET_PREFIX
      ),
      undefined,
      request
    );
  }
}
