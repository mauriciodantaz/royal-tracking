import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { SettingsRow } from "@/lib/db/types";
import { processPurchaseEvent } from "@/lib/integrations/process-purchase";
import { rateLimit } from "@/lib/rate-limit/memory";
import { getClientIp } from "@/lib/tracking/request";
import { parsePurchaseWebhook } from "@/lib/tracking/webhook-parse";

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

/** Legacy global purchase webhook (settings.webhook_token). */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`webhook:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    await ensureDbReady();
    const settings = await queryOne<Pick<SettingsRow, "webhook_token">>(
      `select webhook_token from settings where id = 1 limit 1`
    );

    const expected = settings?.webhook_token;
    const provided = extractToken(request);
    if (!expected || !provided || !tokensEqual(expected, provided)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = parsePurchaseWebhook(raw);
    const provider = parsed?.provider === "generic" ? "hotmart" : parsed?.provider ?? "hotmart";

    const result = await processPurchaseEvent({
      raw,
      parsed,
      sourceProvider: provider,
    });

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
