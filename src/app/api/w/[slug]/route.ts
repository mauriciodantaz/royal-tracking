import { NextResponse, type NextRequest } from "next/server";

import { publicErrorBody, logAndPublicError } from "@/lib/http/public-error";
import { getConnectionByWebhookSlug } from "@/lib/integrations/connections";
import { processInboundConnection } from "@/lib/integrations/process-inbound";
import {
  authorizeInboundWebhook,
  readWebhookJson,
} from "@/lib/integrations/webhook-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/tracking/request";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Short listen-only webhook for any inbound connection:
 * POST /api/w/{slug}
 */
export async function POST(request: NextRequest, context: Ctx) {
  const ip = getClientIp(request);
  const limited = rateLimit(`webhook-w:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(publicErrorBody("rate_limited"), { status: 429 });
  }

  try {
    const { slug } = await context.params;
    const conn = await getConnectionByWebhookSlug(slug);
    if (!conn) {
      return NextResponse.json(publicErrorBody("not_found"), { status: 404 });
    }

    const parsed = await readWebhookJson(request);
    if (!parsed.ok) {
      const status = parsed.error === "payload_too_large" ? 413 : 400;
      return NextResponse.json(publicErrorBody(parsed.error), { status });
    }

    const authorized = await authorizeInboundWebhook(
      request,
      conn,
      parsed.body
    );
    if (!authorized) {
      return NextResponse.json(publicErrorBody("unauthorized"), {
        status: 401,
      });
    }

    const result = await processInboundConnection({
      conn,
      raw: parsed.body,
    });
    if (!result.ok) {
      return NextResponse.json(
        publicErrorBody("bad_request", { code: result.error }),
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    logAndPublicError("webhook-w", err);
    return NextResponse.json(publicErrorBody("internal"), { status: 500 });
  }
}
