import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { PurchaseRow, SettingsRow } from "@/lib/db/types";
import { sendPurchaseToAllGa4 } from "@/lib/ga4/mp";
import { sendToAllMetaPixels } from "@/lib/meta/capi";
import { rateLimit } from "@/lib/rate-limit/memory";
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
    await ensureDbReady();
    const settings = await queryOne<
      Pick<SettingsRow, "webhook_token" | "currency" | "test_event_code">
    >(
      `select webhook_token, currency, test_event_code from settings where id = 1 limit 1`
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

    const purchase = parsePurchaseWebhook(raw);
    if (!purchase) {
      return NextResponse.json(
        { error: "unrecognized_payload" },
        { status: 400 }
      );
    }

    const metaEventId = purchaseEventId(purchase.transaction_id);

    const existing = await queryOne<PurchaseRow>(
      `select * from purchases where transaction_id = $1 limit 1`,
      [purchase.transaction_id]
    );

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

    const saved = await queryOne<PurchaseRow>(
      `insert into purchases (
         transaction_id, trck_user_id, email, email_hash, phone_hash,
         product_name, product_id, value, currency, status,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         fbp, fbc, geo_country, geo_region, geo_city,
         match_status, match_reason, meta_event_id, ga_client_id, webhook_raw
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb
       )
       on conflict (transaction_id) do update set
         trck_user_id = coalesce(excluded.trck_user_id, purchases.trck_user_id),
         email = coalesce(excluded.email, purchases.email),
         email_hash = coalesce(excluded.email_hash, purchases.email_hash),
         phone_hash = coalesce(excluded.phone_hash, purchases.phone_hash),
         product_name = coalesce(excluded.product_name, purchases.product_name),
         product_id = coalesce(excluded.product_id, purchases.product_id),
         value = coalesce(excluded.value, purchases.value),
         currency = coalesce(excluded.currency, purchases.currency),
         status = coalesce(excluded.status, purchases.status),
         utm_source = coalesce(excluded.utm_source, purchases.utm_source),
         utm_medium = coalesce(excluded.utm_medium, purchases.utm_medium),
         utm_campaign = coalesce(excluded.utm_campaign, purchases.utm_campaign),
         utm_term = coalesce(excluded.utm_term, purchases.utm_term),
         utm_content = coalesce(excluded.utm_content, purchases.utm_content),
         fbp = coalesce(excluded.fbp, purchases.fbp),
         fbc = coalesce(excluded.fbc, purchases.fbc),
         geo_country = coalesce(excluded.geo_country, purchases.geo_country),
         geo_region = coalesce(excluded.geo_region, purchases.geo_region),
         geo_city = coalesce(excluded.geo_city, purchases.geo_city),
         match_status = excluded.match_status,
         match_reason = excluded.match_reason,
         meta_event_id = coalesce(excluded.meta_event_id, purchases.meta_event_id),
         ga_client_id = coalesce(excluded.ga_client_id, purchases.ga_client_id),
         webhook_raw = coalesce(excluded.webhook_raw, purchases.webhook_raw),
         updated_at = now()
       returning *`,
      [
        purchase.transaction_id,
        trckUserId,
        purchase.email ?? null,
        hashEmail(purchase.email),
        hashPhone(purchase.phone),
        purchase.product_name ?? null,
        purchase.product_id ?? null,
        purchase.value,
        currency,
        purchase.status,
        purchase.utm_source ?? visitor?.utm_source ?? null,
        purchase.utm_medium ?? visitor?.utm_medium ?? null,
        purchase.utm_campaign ?? visitor?.utm_campaign ?? null,
        purchase.utm_term ?? visitor?.utm_term ?? null,
        purchase.utm_content ?? visitor?.utm_content ?? null,
        visitor?.fbp ?? null,
        visitor?.fbc ?? null,
        visitor?.geo_country ?? null,
        visitor?.geo_region ?? null,
        visitor?.geo_city ?? null,
        match.match_status,
        match.match_reason,
        metaEventId,
        visitor?.ga_client_id ?? null,
        JSON.stringify(raw),
      ]
    );

    if (!saved) {
      return NextResponse.json(
        { error: "db_error", message: "purchase upsert failed" },
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
          externalIdHash:
            visitor?.external_id_hash ??
            (trckUserId ? hashPii(trckUserId) : null),
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

    await query(
      `update purchases set
         payload_meta = $1::jsonb,
         response_meta = $2::jsonb,
         payload_ga4 = $3::jsonb,
         response_ga4 = $4::jsonb,
         sent_meta_at = $5,
         sent_ga4_at = $6,
         updated_at = now()
       where transaction_id = $7`,
      [
        JSON.stringify(metaResults),
        JSON.stringify(metaResults),
        JSON.stringify(ga4Results),
        JSON.stringify(ga4Results),
        sentMetaAt,
        sentGa4At,
        purchase.transaction_id,
      ]
    );

    await query(
      `insert into events_log (
         trck_user_id, event_name, event_id,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         payload_meta, response_meta, payload_ga4, response_ga4,
         ip, geo_country, geo_region, geo_city
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16
       )
       on conflict (event_id) do nothing`,
      [
        trckUserId,
        "Purchase",
        metaEventId,
        purchase.utm_source ?? visitor?.utm_source ?? null,
        purchase.utm_medium ?? visitor?.utm_medium ?? null,
        purchase.utm_campaign ?? visitor?.utm_campaign ?? null,
        purchase.utm_term ?? visitor?.utm_term ?? null,
        purchase.utm_content ?? visitor?.utm_content ?? null,
        JSON.stringify(metaResults),
        JSON.stringify(metaResults),
        JSON.stringify(ga4Results),
        JSON.stringify(ga4Results),
        visitor?.ip ?? null,
        visitor?.geo_country ?? null,
        visitor?.geo_region ?? null,
        visitor?.geo_city ?? null,
      ]
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
