import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { rateLimit } from "@/lib/rate-limit/memory";
import { lookupGeo } from "@/lib/tracking/geo";
import {
  hashEmail,
  hashPhone,
  hashPii,
  newTrckUserId,
} from "@/lib/tracking/hash";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import { identifySchema } from "@/lib/tracking/schemas";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`identify:${ip}`, 60, 60_000);
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

  const parsed = identifySchema.safeParse(json);
  if (!parsed.success) {
    return jsonCors(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
      request
    );
  }

  const body = parsed.data;
  const userAgent = getUserAgent(request);
  const geo = await lookupGeo(ip);
  const trckUserId = body.trck_user_id ?? newTrckUserId();

  try {
    await ensureDbReady();
    const data = await queryOne<
      Pick<VisitorRow, "trck_user_id" | "ga_client_id" | "ga_session_id">
    >(
      `insert into visitors (
         trck_user_id, email, email_hash, phone_hash,
         first_name_hash, last_name_hash, city_hash, state_hash, country_hash,
         external_id_hash, fbp, fbc, ga_client_id, ga_session_id, gclid, ttclid,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         referrer, ip, user_agent, geo_country, geo_region, geo_city, pixel_id
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
       )
       on conflict (trck_user_id) do update set
         email = coalesce(excluded.email, visitors.email),
         email_hash = coalesce(excluded.email_hash, visitors.email_hash),
         phone_hash = coalesce(excluded.phone_hash, visitors.phone_hash),
         first_name_hash = coalesce(excluded.first_name_hash, visitors.first_name_hash),
         last_name_hash = coalesce(excluded.last_name_hash, visitors.last_name_hash),
         city_hash = coalesce(excluded.city_hash, visitors.city_hash),
         state_hash = coalesce(excluded.state_hash, visitors.state_hash),
         country_hash = coalesce(excluded.country_hash, visitors.country_hash),
         external_id_hash = coalesce(excluded.external_id_hash, visitors.external_id_hash),
         fbp = coalesce(excluded.fbp, visitors.fbp),
         fbc = coalesce(excluded.fbc, visitors.fbc),
         ga_client_id = coalesce(excluded.ga_client_id, visitors.ga_client_id),
         ga_session_id = coalesce(excluded.ga_session_id, visitors.ga_session_id),
         gclid = coalesce(excluded.gclid, visitors.gclid),
         ttclid = coalesce(excluded.ttclid, visitors.ttclid),
         utm_source = coalesce(excluded.utm_source, visitors.utm_source),
         utm_medium = coalesce(excluded.utm_medium, visitors.utm_medium),
         utm_campaign = coalesce(excluded.utm_campaign, visitors.utm_campaign),
         utm_term = coalesce(excluded.utm_term, visitors.utm_term),
         utm_content = coalesce(excluded.utm_content, visitors.utm_content),
         referrer = coalesce(excluded.referrer, visitors.referrer),
         ip = coalesce(excluded.ip, visitors.ip),
         user_agent = coalesce(excluded.user_agent, visitors.user_agent),
         geo_country = coalesce(excluded.geo_country, visitors.geo_country),
         geo_region = coalesce(excluded.geo_region, visitors.geo_region),
         geo_city = coalesce(excluded.geo_city, visitors.geo_city),
         pixel_id = coalesce(excluded.pixel_id, visitors.pixel_id),
         updated_at = now()
       returning trck_user_id, ga_client_id, ga_session_id`,
      [
        trckUserId,
        body.email ?? null,
        hashEmail(body.email),
        hashPhone(body.phone),
        hashPii(body.first_name),
        hashPii(body.last_name),
        hashPii(body.city),
        hashPii(body.state),
        hashPii(body.country),
        hashPii(trckUserId),
        body.fbp ?? null,
        body.fbc ?? null,
        body.ga_client_id ?? null,
        body.ga_session_id ?? null,
        body.gclid ?? null,
        body.ttclid ?? null,
        body.utm_source ?? null,
        body.utm_medium ?? null,
        body.utm_campaign ?? null,
        body.utm_term ?? null,
        body.utm_content ?? null,
        body.referrer ?? null,
        ip,
        userAgent,
        geo.geo_country,
        geo.geo_region,
        geo.geo_city,
        body.pixel_id ?? null,
      ]
    );

    if (!data) {
      return jsonCors({ error: "db_error" }, { status: 500 }, request);
    }

    return jsonCors(
      {
        ok: true,
        trck_user_id: data.trck_user_id,
        ga_client_id: data.ga_client_id,
        ga_session_id: data.ga_session_id,
      },
      undefined,
      request
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      // rare race — still ok
    }
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
