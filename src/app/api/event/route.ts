import { type NextRequest } from "next/server";

import { corsPreflight, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, query, queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { sendToAllMetaPixels } from "@/lib/meta/capi";
import { rateLimit } from "@/lib/rate-limit/memory";
import { newEventId } from "@/lib/tracking/hash";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import { eventSchema } from "@/lib/tracking/schemas";

export const runtime = "nodejs";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`event:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return jsonCors(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
      }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return jsonCors(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const eventId = body.event_id ?? newEventId();
  const userAgent = getUserAgent(request);

  try {
    await ensureDbReady();
    const visitor = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [body.trck_user_id]
    );

    const customData =
      body.value !== undefined ||
      body.content_ids ||
      body.content_name ||
      body.content_type
        ? {
            value: body.value,
            currency: body.currency,
            content_ids: body.content_ids,
            content_name: body.content_name,
            content_type: body.content_type,
          }
        : undefined;

    const metaResults = await sendToAllMetaPixels({
      eventName: body.event_name,
      eventId,
      eventSourceUrl: body.event_source_url,
      userData: {
        email: visitor?.email,
        emailHash: visitor?.email_hash,
        phoneHash: visitor?.phone_hash,
        firstNameHash: visitor?.first_name_hash,
        lastNameHash: visitor?.last_name_hash,
        cityHash: visitor?.city_hash,
        stateHash: visitor?.state_hash,
        countryHash: visitor?.country_hash,
        externalId: body.trck_user_id,
        externalIdHash: visitor?.external_id_hash,
        fbp: visitor?.fbp,
        fbc: visitor?.fbc,
        clientIpAddress: visitor?.ip ?? ip,
        clientUserAgent: visitor?.user_agent ?? userAgent,
      },
      customData,
    });

    try {
      await query(
        `insert into events_log (
           trck_user_id, event_name, event_id,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           payload_meta, response_meta, payload_ga4, response_ga4,
           ip, geo_country, geo_region, geo_city
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,null,null,$11,$12,$13,$14
         )`,
        [
          body.trck_user_id,
          body.event_name,
          eventId,
          body.utm_source ?? visitor?.utm_source ?? null,
          body.utm_medium ?? visitor?.utm_medium ?? null,
          body.utm_campaign ?? visitor?.utm_campaign ?? null,
          body.utm_term ?? visitor?.utm_term ?? null,
          body.utm_content ?? visitor?.utm_content ?? null,
          JSON.stringify(metaResults.map((r) => r.payload)),
          JSON.stringify(metaResults),
          visitor?.ip ?? ip,
          visitor?.geo_country ?? null,
          visitor?.geo_region ?? null,
          visitor?.geo_city ?? null,
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return jsonCors({
          ok: true,
          event_id: eventId,
          deduped: true,
        });
      }
      throw err;
    }

    return jsonCors({
      ok: true,
      event_id: eventId,
      meta: metaResults.map((r) => ({
        pixel_id: r.pixel_id,
        label: r.label,
        ok: r.ok,
        status: r.status,
      })),
    });
  } catch (err) {
    return jsonCors(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
