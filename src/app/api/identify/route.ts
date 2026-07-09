import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
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

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`identify:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = identifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const userAgent = getUserAgent(request);
  const geo = lookupGeo(ip);
  const trckUserId = body.trck_user_id ?? newTrckUserId();

  const row = {
    trck_user_id: trckUserId,
    email: body.email ?? null,
    email_hash: hashEmail(body.email),
    phone_hash: hashPhone(body.phone),
    first_name_hash: hashPii(body.first_name),
    last_name_hash: hashPii(body.last_name),
    city_hash: hashPii(body.city),
    state_hash: hashPii(body.state),
    country_hash: hashPii(body.country),
    external_id_hash: hashPii(trckUserId),
    fbp: body.fbp ?? null,
    fbc: body.fbc ?? null,
    ga_client_id: body.ga_client_id ?? null,
    ga_session_id: body.ga_session_id ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_term: body.utm_term ?? null,
    utm_content: body.utm_content ?? null,
    referrer: body.referrer ?? null,
    ip,
    user_agent: userAgent,
    geo_country: geo.geo_country,
    geo_region: geo.geo_region,
    geo_city: geo.geo_city,
    pixel_id: body.pixel_id ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("visitors")
      .upsert(row, { onConflict: "trck_user_id" })
      .select("trck_user_id, ga_client_id, ga_session_id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "db_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      trck_user_id: data.trck_user_id,
      ga_client_id: data.ga_client_id,
      ga_session_id: data.ga_session_id,
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
