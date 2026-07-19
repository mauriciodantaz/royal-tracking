import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import {
  decryptWebhookSecret,
  getConnection,
} from "@/lib/integrations/connections";
import { processPurchaseEvent } from "@/lib/integrations/process-purchase";
import { processRdWebhook } from "@/lib/rd/process-webhook";
import { rateLimit } from "@/lib/rate-limit/memory";
import { getClientIp } from "@/lib/tracking/request";
import { parsePurchaseWebhook } from "@/lib/tracking/webhook-parse";
import { processWhatsappMessageWebhook } from "@/lib/whatsapp/process-message";

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

/** Per-connection inbound webhook: /api/webhook/in/{connectionId} */
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
    if (conn.direction === "outbound") {
      return NextResponse.json({ error: "not_inbound" }, { status: 400 });
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

    const marketplace = ["hotmart", "kiwify", "eduzz"].includes(conn.provider);
    if (marketplace) {
      const parsed = parsePurchaseWebhook(raw);
      const result = await processPurchaseEvent({
        raw,
        parsed,
        sourceProvider: conn.provider,
        sourceConnectionId: conn.id,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    if (
      conn.provider === "rdstation_crm" ||
      conn.provider === "rdstation_mkt"
    ) {
      const result = await processRdWebhook({ conn, raw });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    if (conn.provider === "evolution_api" || conn.provider === "uazapi") {
      const result = await processWhatsappMessageWebhook({ conn, raw });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    // Generic CRM-style payload: expect { event, email?, phone?, ... }
    const rec =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const sourceEvent =
      (typeof rec?.event === "string" && rec.event) ||
      (typeof rec?.event_name === "string" && rec.event_name) ||
      "Lead";

    if (
      sourceEvent.toLowerCase().includes("purchase") ||
      sourceEvent.toLowerCase().includes("won")
    ) {
      const result = await processPurchaseEvent({
        raw,
        sourceProvider: conn.provider,
        sourceConnectionId: conn.id,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({
      ok: true,
      received: true,
      provider: conn.provider,
      source_event: sourceEvent,
      note: "CRM lead ingest via dedicated adapters in phase 2; purchase parsers active for marketplaces",
    });
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
