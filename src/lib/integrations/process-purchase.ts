import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { PurchaseRow, SettingsRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import {
  hashEmail,
  hashPhone,
  hashPii,
  purchaseEventId,
} from "@/lib/tracking/hash";
import { matchVisitor } from "@/lib/tracking/match";
import { resolveAndPersistGaClientId } from "@/lib/tracking/persist-ga-client-id";
import {
  parsePurchaseWebhook,
  type NormalizedPurchase,
} from "@/lib/tracking/webhook-parse";

export type ProcessPurchaseResult = {
  ok: true;
  deduped?: boolean;
  transaction_id: string;
  match: { status: string; reason: string | null };
  meta_event_id: string;
  dispatch_targets?: number;
};

export async function processPurchaseEvent(opts: {
  raw: unknown;
  sourceProvider: string;
  sourceConnectionId?: string | null;
  parsed?: NormalizedPurchase | null;
}): Promise<ProcessPurchaseResult | { ok: false; error: string; status: number }> {
  await ensureDbReady();
  const purchase = opts.parsed ?? parsePurchaseWebhook(opts.raw);
  if (!purchase) {
    return { ok: false, error: "unrecognized_payload", status: 400 };
  }

  const settings = await queryOne<
    Pick<SettingsRow, "currency" | "test_event_code">
  >(`select currency, test_event_code from settings where id = 1 limit 1`);

  const metaEventId = purchaseEventId(purchase.transaction_id);
  const existing = await queryOne<PurchaseRow>(
    `select * from purchases where transaction_id = $1 limit 1`,
    [purchase.transaction_id]
  );

  if (existing?.sent_meta_at && existing?.sent_ga4_at) {
    return {
      ok: true,
      deduped: true,
      transaction_id: purchase.transaction_id,
      match: {
        status: existing.match_status ?? "unknown",
        reason: existing.match_reason,
      },
      meta_event_id: metaEventId,
    };
  }

  const match = await matchVisitor({
    trck_user_id: purchase.trck_user_id,
    email: purchase.email,
    phone: purchase.phone,
  });
  const visitor = match.visitor;
  const trckUserId = purchase.trck_user_id ?? visitor?.trck_user_id ?? null;
  const currency = purchase.currency || settings?.currency || "BRL";
  const gaResolved = await resolveAndPersistGaClientId({
    stored: visitor?.ga_client_id,
    storedSource: visitor?.ga_client_id_source,
    storedBrowserGa: visitor?.browser_ga_client_id,
    trckUserId,
    visitorCreatedAt: visitor?.created_at,
  });

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
      gaResolved.clientId,
      JSON.stringify(opts.raw),
    ]
  );

  if (!saved) {
    return { ok: false, error: "db_error", status: 500 };
  }

  const dispatch = await dispatchEvent({
    sourceProvider: opts.sourceProvider,
    sourceConnectionId: opts.sourceConnectionId,
    sourceEvent: "Purchase",
    eventId: metaEventId,
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
        visitor?.external_id_hash ?? (trckUserId ? hashPii(trckUserId) : null),
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
    gaClientId: gaResolved.clientId,
    gaClientIdSource: gaResolved.source,
    gaIdentityMeta: gaResolved.meta,
    gaSessionId: visitor?.ga_session_id,
  });

  const now = new Date().toISOString();
  const metaResults = dispatch.results.filter((r) => r.provider === "meta_pixel");
  const ga4Results = dispatch.results.filter((r) => r.provider === "ga4");

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
      JSON.stringify(metaResults.map((r) => r.payload)),
      JSON.stringify(metaResults),
      JSON.stringify(ga4Results.map((r) => r.payload)),
      JSON.stringify(ga4Results),
      now,
      now,
      purchase.transaction_id,
    ]
  );

  const { serverMeta, serverGa4 } = serverFlagsFromDispatch(dispatch.results);
  const channelClass = classifyChannel({
    webMeta: false,
    webGa4: false,
    serverMeta,
    serverGa4,
  });

  await query(
    `insert into events_log (
       trck_user_id, event_name, event_id,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       payload_meta, response_meta, payload_ga4, response_ga4,
       ip, geo_country, geo_region, geo_city,
       ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,
       'webhook', false, false, $17, $18, $19
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
      JSON.stringify(metaResults.map((r) => r.payload)),
      JSON.stringify(metaResults),
      JSON.stringify(ga4Results.map((r) => r.payload)),
      JSON.stringify(ga4Results),
      visitor?.ip ?? null,
      visitor?.geo_country ?? null,
      visitor?.geo_region ?? null,
      visitor?.geo_city ?? null,
      serverMeta,
      serverGa4,
      channelClass,
    ]
  );

  return {
    ok: true,
    transaction_id: purchase.transaction_id,
    match: { status: match.match_status, reason: match.match_reason },
    meta_event_id: metaEventId,
    dispatch_targets: dispatch.targets,
  };
}
