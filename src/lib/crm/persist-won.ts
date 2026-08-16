import "server-only";

import { queryOne } from "@/lib/db/pool";
import type { PurchaseRow, VisitorRow } from "@/lib/db/types";
import type { MetaCustomData } from "@/lib/meta/capi";
import { crmPurchaseTransactionId } from "@/lib/crm/sale-payload";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";

export async function persistCrmWonPurchase(opts: {
  provider: "rdcrm" | "pipedrive";
  dealId: string;
  eventId: string;
  email: string | null;
  phone: string | null;
  visitor: VisitorRow | null;
  customData: MetaCustomData;
  gaClientId: string | null;
}): Promise<void> {
  const transactionId = crmPurchaseTransactionId(opts.provider, opts.dealId);
  const productId = opts.customData.content_ids?.[0] ?? opts.dealId;
  const productName = opts.customData.content_name ?? null;
  await queryOne<PurchaseRow>(
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
       meta_event_id = coalesce(purchases.meta_event_id, excluded.meta_event_id),
       ga_client_id = coalesce(purchases.ga_client_id, excluded.ga_client_id),
       updated_at = now()
     returning id`,
    [
      transactionId,
      opts.visitor?.trck_user_id ?? null,
      opts.email,
      hashEmail(opts.email),
      hashPhone(opts.phone),
      productName,
      productId,
      opts.customData.value ?? null,
      opts.customData.currency ?? "BRL",
      "won",
      opts.visitor?.utm_source ?? null,
      opts.visitor?.utm_medium ?? null,
      opts.visitor?.utm_campaign ?? null,
      opts.visitor?.utm_term ?? null,
      opts.visitor?.utm_content ?? null,
      opts.visitor?.fbp ?? null,
      opts.visitor?.fbc ?? null,
      opts.visitor?.geo_country ?? null,
      opts.visitor?.geo_region ?? null,
      opts.visitor?.geo_city ?? null,
      opts.visitor ? "matched" : "unmatched",
      opts.visitor ? "crm_identity" : "crm_no_visitor",
      opts.eventId,
      opts.gaClientId,
      JSON.stringify({ source: opts.provider, deal_id: opts.dealId }),
    ]
  );
}
