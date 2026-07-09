import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { sendToAllMetaPixels } from "@/lib/meta/capi";
import { sendPurchaseToAllGa4 } from "@/lib/ga4/mp";
import { rateLimit } from "@/lib/rate-limit/memory";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashEmail,
  hashPhone,
  hashPii,
  purchaseEventId,
} from "@/lib/tracking/hash";
import { matchVisitor } from "@/lib/tracking/match";
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

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`webhook:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("settings")
      .select("webhook_token, currency, test_event_code")
      .eq("id", 1)
      .maybeSingle();

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

    const purchase = parsePurchaseWebhook(raw);
    if (!purchase) {
      return NextResponse.json(
        { error: "unrecognized_payload" },
        { status: 400 }
      );
    }

    const metaEventId = purchaseEventId(purchase.transaction_id);

    const { data: existing } = await admin
      .from("purchases")
      .select("*")
      .eq("transaction_id", purchase.transaction_id)
      .maybeSingle();

    if (existing?.sent_meta_at && existing?.sent_ga4_at) {
      return NextResponse.json({
        ok: true,
        deduped: true,
        transaction_id: purchase.transaction_id,
      });
    }

    const match = await matchVisitor({
      trck_user_id: purchase.trck_user_id,
      email: purchase.email,
      phone: purchase.phone,
    });

    const visitor = match.visitor;
    const trckUserId =
      purchase.trck_user_id ?? visitor?.trck_user_id ?? null;
    const currency = purchase.currency || settings?.currency || "BRL";

    const row = {
      transaction_id: purchase.transaction_id,
      trck_user_id: trckUserId,
      email: purchase.email ?? null,
      email_hash: hashEmail(purchase.email),
      phone_hash: hashPhone(purchase.phone),
      product_name: purchase.product_name ?? null,
      product_id: purchase.product_id ?? null,
      value: purchase.value,
      currency,
      status: purchase.status,
      utm_source: purchase.utm_source ?? visitor?.utm_source ?? null,
      utm_medium: purchase.utm_medium ?? visitor?.utm_medium ?? null,
      utm_campaign: purchase.utm_campaign ?? visitor?.utm_campaign ?? null,
      utm_term: purchase.utm_term ?? visitor?.utm_term ?? null,
      utm_content: purchase.utm_content ?? visitor?.utm_content ?? null,
      fbp: visitor?.fbp ?? null,
      fbc: visitor?.fbc ?? null,
      geo_country: visitor?.geo_country ?? null,
      geo_region: visitor?.geo_region ?? null,
      geo_city: visitor?.geo_city ?? null,
      match_status: match.match_status,
      match_reason: match.match_reason,
      meta_event_id: metaEventId,
      ga_client_id: visitor?.ga_client_id ?? null,
      webhook_raw: raw as object,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upsertError } = await admin
      .from("purchases")
      .upsert(row, { onConflict: "transaction_id" })
      .select("*")
      .single();

    if (upsertError) {
      return NextResponse.json(
        { error: "db_error", message: upsertError.message },
        { status: 500 }
      );
    }

    let metaResults = saved.payload_meta as unknown;
    let ga4Results = saved.payload_ga4 as unknown;
    let sentMetaAt = saved.sent_meta_at;
    let sentGa4At = saved.sent_ga4_at;

    if (!sentMetaAt) {
      const results = await sendToAllMetaPixels({
        eventName: "Purchase",
        eventId: metaEventId,
        testEventCode: settings?.test_event_code,
        userData: {
          email: purchase.email ?? visitor?.email,
          emailHash: hashEmail(purchase.email) ?? visitor?.email_hash,
          phoneHash: hashPhone(purchase.phone) ?? visitor?.phone_hash,
          firstNameHash: hashPii(purchase.first_name) ?? visitor?.first_name_hash,
          lastNameHash: hashPii(purchase.last_name) ?? visitor?.last_name_hash,
          cityHash: visitor?.city_hash,
          stateHash: visitor?.state_hash,
          countryHash: visitor?.country_hash,
          externalId: trckUserId,
          externalIdHash: visitor?.external_id_hash ?? (trckUserId ? hashPii(trckUserId) : null),
          fbp: visitor?.fbp,
          fbc: visitor?.fbc,
          clientIpAddress: visitor?.ip,
          clientUserAgent: visitor?.user_agent,
        },
        customData: {
          value: purchase.value,
          currency,
          content_ids: purchase.product_id ? [purchase.product_id] : undefined,
          content_name: purchase.product_name ?? undefined,
          content_type: "product",
        },
      });
      metaResults = results;
      sentMetaAt = new Date().toISOString();
    }

    if (!sentGa4At) {
      const clientId = visitor?.ga_client_id;
      if (clientId) {
        const results = await sendPurchaseToAllGa4({
          clientId,
          sessionId: visitor?.ga_session_id,
          transactionId: purchase.transaction_id,
          value: purchase.value,
          currency,
          items: [
            {
              item_id: purchase.product_id ?? undefined,
              item_name: purchase.product_name ?? undefined,
              price: purchase.value,
              quantity: 1,
            },
          ],
        });
        ga4Results = results;
        sentGa4At = new Date().toISOString();
      } else {
        ga4Results = [
          {
            ok: false,
            error: "missing_ga_client_id",
            note: "Purchase stored; GA4 MP skipped until visitor has client_id",
          },
        ];
        sentGa4At = new Date().toISOString();
      }
    }

    await admin
      .from("purchases")
      .update({
        payload_meta: metaResults as object,
        response_meta: metaResults as object,
        payload_ga4: ga4Results as object,
        response_ga4: ga4Results as object,
        sent_meta_at: sentMetaAt,
        sent_ga4_at: sentGa4At,
      })
      .eq("transaction_id", purchase.transaction_id);

    // Also log as events_log Purchase for dashboard funnel
    await admin.from("events_log").upsert(
      {
        trck_user_id: trckUserId,
        event_name: "Purchase",
        event_id: metaEventId,
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        utm_campaign: row.utm_campaign,
        utm_term: row.utm_term,
        utm_content: row.utm_content,
        payload_meta: metaResults as object,
        response_meta: metaResults as object,
        payload_ga4: ga4Results as object,
        response_ga4: ga4Results as object,
        ip: visitor?.ip ?? null,
        geo_country: visitor?.geo_country ?? null,
        geo_region: visitor?.geo_region ?? null,
        geo_city: visitor?.geo_city ?? null,
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    );

    return NextResponse.json({
      ok: true,
      transaction_id: purchase.transaction_id,
      match: { status: match.match_status, reason: match.match_reason },
      meta_event_id: metaEventId,
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
