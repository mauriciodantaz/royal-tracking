import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, query, queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { getSnippetConnection } from "@/lib/integrations/connections";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import { rateLimit } from "@/lib/rate-limit/memory";
import { newEventId } from "@/lib/tracking/hash";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import { eventSchema } from "@/lib/tracking/schemas";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`event:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return jsonCors(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
      },
      request
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 }, request);
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return jsonCors(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
      request
    );
  }

  const body = parsed.data;
  const eventId = body.event_id ?? newEventId();
  const userAgent = getUserAgent(request);

  try {
    await ensureDbReady();
    const snippet = await getSnippetConnection();
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

    const dispatch = await dispatchEvent({
      sourceProvider: "snippet",
      sourceConnectionId: snippet?.id,
      sourceEvent: body.event_name,
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
      gaClientId: visitor?.ga_client_id,
      gaSessionId: visitor?.ga_session_id,
    });

    try {
      await query(
        `insert into events_log (
           trck_user_id, event_name, event_id,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           payload_meta, response_meta, payload_ga4, response_ga4,
           ip, geo_country, geo_region, geo_city
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16
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
          JSON.stringify(
            dispatch.results
              .filter((r) => r.provider === "meta_pixel")
              .map((r) => r.payload)
          ),
          JSON.stringify(
            dispatch.results.filter((r) => r.provider === "meta_pixel")
          ),
          JSON.stringify(
            dispatch.results
              .filter((r) => r.provider === "ga4")
              .map((r) => r.payload)
          ),
          JSON.stringify(dispatch.results.filter((r) => r.provider === "ga4")),
          visitor?.ip ?? ip,
          visitor?.geo_country ?? null,
          visitor?.geo_region ?? null,
          visitor?.geo_city ?? null,
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return jsonCors(
          {
            ok: true,
            event_id: eventId,
            deduped: true,
          },
          undefined,
          request
        );
      }
      throw err;
    }

    return jsonCors(
      {
        ok: true,
        event_id: eventId,
        dispatch: {
          targets: dispatch.targets,
          results: dispatch.results.map((r) => ({
            connection_id: r.connectionId,
            provider: r.provider,
            ok: r.ok,
            status: r.status,
            error: r.error,
          })),
        },
      },
      undefined,
      request
    );
  } catch (err) {
    return jsonCors(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
      request
    );
  }
}
