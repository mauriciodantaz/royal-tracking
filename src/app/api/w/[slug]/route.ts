import { NextResponse, type NextRequest } from "next/server";

import { getConnectionByWebhookSlug } from "@/lib/integrations/connections";
import { rateLimit } from "@/lib/rate-limit/memory";
import { getClientIp } from "@/lib/tracking/request";
import { processWhatsappMessageWebhook } from "@/lib/whatsapp/process-message";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Short listen-only webhook for RD Conversas:
 * POST /api/w/{slug}
 */
export async function POST(request: NextRequest, context: Ctx) {
  const ip = getClientIp(request);
  const limited = rateLimit(`webhook-w:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const { slug } = await context.params;
    const conn = await getConnectionByWebhookSlug(slug);
    if (!conn) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (conn.provider !== "rdstation_conversas") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const result = await processWhatsappMessageWebhook({ conn, raw });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
