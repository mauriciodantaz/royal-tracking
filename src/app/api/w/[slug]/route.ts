import { NextResponse, type NextRequest } from "next/server";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  decryptWebhookSecret,
  getConnectionByWebhookSlug,
} from "@/lib/integrations/connections";
import { processInboundConnection } from "@/lib/integrations/process-inbound";
import { PIPEDRIVE_WEBHOOK_AUTH_USER } from "@/lib/pipedrive/sync";
import { rateLimit } from "@/lib/rate-limit/memory";
import { getClientIp } from "@/lib/tracking/request";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

async function assertPipedriveBasicAuth(
  request: NextRequest,
  conn: IntegrationConnectionRow
): Promise<boolean> {
  const secret = await decryptWebhookSecret(conn);
  if (!secret) return false;

  const header = request.headers.get("authorization") || "";
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m?.[1]) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);
  return user === PIPEDRIVE_WEBHOOK_AUTH_USER && pass === secret;
}

/**
 * Short listen-only webhook for any inbound connection:
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

    if (conn.provider === "pipedrive") {
      const ok = await assertPipedriveBasicAuth(request, conn);
      if (!ok) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const result = await processInboundConnection({ conn, raw });
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
