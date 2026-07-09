import { NextResponse, type NextRequest } from "next/server";

import { sendToAllMetaPixels } from "@/lib/meta/capi";
import { rateLimit } from "@/lib/rate-limit/memory";
import { createAdminClient } from "@/lib/supabase/admin";
import { newEventId } from "@/lib/tracking/hash";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import { eventSchema } from "@/lib/tracking/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`event:${ip}`, 120, 60_000);
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

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const eventId = body.event_id ?? newEventId();
  const userAgent = getUserAgent(request);

  try {
    const admin = createAdminClient();
    const { data: visitor } = await admin
      .from("visitors")
      .select("*")
      .eq("trck_user_id", body.trck_user_id)
      .maybeSingle();

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

    const { error } = await admin.from("events_log").insert({
      trck_user_id: body.trck_user_id,
      event_name: body.event_name,
      event_id: eventId,
      utm_source: body.utm_source ?? visitor?.utm_source ?? null,
      utm_medium: body.utm_medium ?? visitor?.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? visitor?.utm_campaign ?? null,
      utm_term: body.utm_term ?? visitor?.utm_term ?? null,
      utm_content: body.utm_content ?? visitor?.utm_content ?? null,
      payload_meta: metaResults.map((r) => r.payload),
      response_meta: metaResults,
      payload_ga4: null,
      response_ga4: null,
      ip: visitor?.ip ?? ip,
      geo_country: visitor?.geo_country ?? null,
      geo_region: visitor?.geo_region ?? null,
      geo_city: visitor?.geo_city ?? null,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({
          ok: true,
          event_id: eventId,
          deduped: true,
        });
      }
      return NextResponse.json(
        { error: "db_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
