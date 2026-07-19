import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import {
  decryptWebhookSecret,
  getConnection,
} from "@/lib/integrations/connections";
import { processInboundConnection } from "@/lib/integrations/process-inbound";
import { rateLimit } from "@/lib/rate-limit/memory";
import { getClientIp } from "@/lib/tracking/request";

export const runtime = "nodejs";

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function extractToken(request: NextRequest): string | null {
  const header = request.headers.get("x-webhook-token");
  if (header) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.nextUrl.searchParams.get("token");
}

type Ctx = { params: Promise<{ connectionId: string }> };

/** Legacy per-connection inbound webhook: /api/webhook/in/{connectionId} */
export async function POST(request: NextRequest, context: Ctx) {
  const ip = getClientIp(request);
  const limited = rateLimit(`webhook-in:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const { connectionId } = await context.params;
    const conn = await getConnection(connectionId);
    if (!conn || !conn.active) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const secret = await decryptWebhookSecret(conn);
    const provided = extractToken(request);
    if (!secret || !provided || !tokensEqual(secret, provided)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
