"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  seedDefaultMappingsForOutbound,
} from "@/lib/integrations/connections";
import {
  getModule,
  isIntegrationProvider,
} from "@/lib/integrations/registry";
import { sendCapiToPixel } from "@/lib/meta/capi-single";
import { sendPurchaseToAllGa4 } from "@/lib/ga4/mp";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { newEventId } from "@/lib/tracking/hash";
import { decryptSecret } from "@/lib/crypto/secrets";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("unauthorized");
  await ensureDbReady();
  return session.user;
}

function revalidateIntegrations(provider?: string) {
  revalidatePath("/dashboard/integracoes");
  if (provider) {
    revalidatePath(`/dashboard/integracoes/${provider}`);
  }
  revalidatePath("/dashboard/campanhas");
}

export async function upsertConnection(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const provider = String(formData.get("provider") ?? "").trim();
  if (!isIntegrationProvider(provider)) throw new Error("invalid_provider");

  const mod = getModule(provider)!;
  const label = String(formData.get("label") ?? "").trim() || mod.name;
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  const accessToken = String(formData.get("access_token") ?? "").trim();
  const webhookSecret = String(formData.get("webhook_secret") ?? "").trim();
  const refreshToken = String(formData.get("refresh_token") ?? "").trim();

  const config: Record<string, string> = {};
  for (const field of mod.connectFields) {
    if (field.secret || field.key === "label") continue;
    const v = String(formData.get(field.key) ?? "").trim();
    if (v) config[field.key] = v;
  }

  const accountExternalId =
    config.pixel_id ||
    config.measurement_id ||
    config.ad_account_id ||
    String(formData.get("account_external_id") ?? "").trim() ||
    null;

  let accessCipher: string | null = null;
  if (accessToken && !accessToken.startsWith("••••")) {
    accessCipher = await encryptSecret(accessToken);
  }
  let webhookCipher: string | null = null;
  if (webhookSecret && !webhookSecret.startsWith("••••")) {
    webhookCipher = await encryptSecret(webhookSecret);
  }
  let refreshCipher: string | null = null;
  if (refreshToken && !refreshToken.startsWith("••••")) {
    refreshCipher = await encryptSecret(refreshToken);
  }

  if (id) {
    const sets: string[] = [
      `label = $1`,
      `active = $2`,
      `config = config || $3::jsonb`,
      `updated_at = now()`,
    ];
    const params: unknown[] = [label, active, JSON.stringify(config)];
    if (accountExternalId) {
      params.push(accountExternalId);
      sets.push(`account_external_id = $${params.length}`);
    }
    if (accessCipher) {
      params.push(accessCipher);
      sets.push(`access_token_cipher = $${params.length}`);
    }
    if (webhookCipher) {
      params.push(webhookCipher);
      sets.push(`webhook_secret_cipher = $${params.length}`);
    }
    if (refreshCipher) {
      params.push(refreshCipher);
      sets.push(`refresh_token_cipher = $${params.length}`);
    }
    params.push(id);
    await query(
      `update integration_connections set ${sets.join(", ")} where id = $${params.length}`,
      params
    );
    // Sync legacy tables for Meta/GA4
    await syncLegacyTable(provider, id);
  } else {
    if (mod.authType === "token" && !accessCipher && provider !== "snippet") {
      throw new Error("access_token required");
    }
    if (mod.authType === "webhook_secret" && !webhookCipher) {
      throw new Error("webhook_secret required");
    }
    const row = await queryOne<IntegrationConnectionRow>(
      `insert into integration_connections (
         provider, label, auth_type, direction,
         access_token_cipher, refresh_token_cipher, webhook_secret_cipher,
         account_external_id, config, active
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       returning *`,
      [
        provider,
        label,
        mod.authType,
        mod.direction,
        accessCipher,
        refreshCipher,
        webhookCipher,
        accountExternalId,
        JSON.stringify(config),
        active,
      ]
    );
    if (row && (provider === "meta_pixel" || provider === "ga4")) {
      await seedDefaultMappingsForOutbound(row.id, provider);
    }
    if (row) await syncLegacyTable(provider, row.id);
  }

  revalidateIntegrations(provider);
  return { ok: true as const };
}

async function syncLegacyTable(provider: string, connectionId: string) {
  const conn = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [connectionId]
  );
  if (!conn) return;
  const cfg =
    conn.config && typeof conn.config === "object" && !Array.isArray(conn.config)
      ? (conn.config as Record<string, unknown>)
      : {};

  if (provider === "meta_pixel") {
    const pixelId = String(cfg.pixel_id ?? conn.account_external_id ?? "");
    await query(
      `insert into meta_pixels (id, label, pixel_id, capi_token_cipher, active)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set
         label = excluded.label,
         pixel_id = excluded.pixel_id,
         capi_token_cipher = coalesce(excluded.capi_token_cipher, meta_pixels.capi_token_cipher),
         active = excluded.active,
         updated_at = now()`,
      [conn.id, conn.label, pixelId, conn.access_token_cipher, conn.active]
    );
  } else if (provider === "ga4") {
    const mid = String(cfg.measurement_id ?? conn.account_external_id ?? "");
    await query(
      `insert into ga4_accounts (id, label, measurement_id, api_secret_cipher, active)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set
         label = excluded.label,
         measurement_id = excluded.measurement_id,
         api_secret_cipher = coalesce(excluded.api_secret_cipher, ga4_accounts.api_secret_cipher),
         active = excluded.active,
         updated_at = now()`,
      [conn.id, conn.label, mid, conn.access_token_cipher, conn.active]
    );
  } else if (provider === "meta_ads") {
    const adId = String(cfg.ad_account_id ?? conn.account_external_id ?? "");
    await query(
      `insert into meta_ad_accounts (id, label, ad_account_id, ads_token_cipher, active)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set
         label = excluded.label,
         ad_account_id = excluded.ad_account_id,
         ads_token_cipher = coalesce(excluded.ads_token_cipher, meta_ad_accounts.ads_token_cipher),
         active = excluded.active,
         updated_at = now()`,
      [conn.id, conn.label, adId, conn.access_token_cipher, conn.active]
    );
  }
}

export async function deleteConnection(id: string) {
  await requireUser();
  const conn = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [id]
  );
  await query(`delete from integration_connections where id = $1`, [id]);
  if (conn?.provider === "meta_pixel") {
    await query(`delete from meta_pixels where id = $1`, [id]);
  } else if (conn?.provider === "ga4") {
    await query(`delete from ga4_accounts where id = $1`, [id]);
  } else if (conn?.provider === "meta_ads") {
    await query(`delete from meta_ad_accounts where id = $1`, [id]);
  }
  revalidateIntegrations(conn?.provider);
  return { ok: true as const };
}

export async function upsertEventMapping(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const source_provider =
    String(formData.get("source_provider") ?? "").trim() || null;
  const source_connection_id =
    String(formData.get("source_connection_id") ?? "").trim() || null;
  const source_event = String(formData.get("source_event") ?? "").trim();
  const dest_connection_id = String(
    formData.get("dest_connection_id") ?? ""
  ).trim();
  const dest_event_name = String(formData.get("dest_event_name") ?? "").trim();
  const enabled =
    formData.get("enabled") === "on" || formData.get("enabled") === "true";

  if (!source_event || !dest_connection_id || !dest_event_name) {
    throw new Error("missing_fields");
  }

  if (id) {
    await query(
      `update integration_event_mappings set
         source_provider = $1,
         source_connection_id = $2,
         source_event = $3,
         dest_connection_id = $4,
         dest_event_name = $5,
         enabled = $6,
         updated_at = now()
       where id = $7`,
      [
        source_provider,
        source_connection_id,
        source_event,
        dest_connection_id,
        dest_event_name,
        enabled,
        id,
      ]
    );
  } else {
    await query(
      `insert into integration_event_mappings (
         source_provider, source_connection_id, source_event,
         dest_connection_id, dest_event_name, enabled
       ) values ($1,$2,$3,$4,$5,$6)`,
      [
        source_provider,
        source_connection_id,
        source_event,
        dest_connection_id,
        dest_event_name,
        enabled,
      ]
    );
  }
  revalidateIntegrations(source_provider ?? undefined);
  return { ok: true as const };
}

export async function deleteEventMapping(id: string) {
  await requireUser();
  await query(`delete from integration_event_mappings where id = $1`, [id]);
  revalidateIntegrations();
  return { ok: true as const };
}

export async function testConnection(id: string) {
  await requireUser();
  const conn = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [id]
  );
  if (!conn) throw new Error("not_found");

  if (conn.provider === "meta_pixel") {
    if (!conn.access_token_cipher) throw new Error("missing_token");
    const cfg =
      conn.config && typeof conn.config === "object" && !Array.isArray(conn.config)
        ? (conn.config as Record<string, unknown>)
        : {};
    const pixelId = String(cfg.pixel_id ?? conn.account_external_id ?? "");
    const result = await sendCapiToPixel({
      pixelId,
      tokenCipher: conn.access_token_cipher,
      input: {
        eventName: "PageView",
        eventId: newEventId(),
        userData: {},
      },
    });
    return { ok: result.ok, detail: result };
  }

  if (conn.provider === "ga4") {
    const results = await sendPurchaseToAllGa4({
      clientId: "test.client.id",
      transactionId: `test_${Date.now()}`,
      value: 1,
      currency: "BRL",
      items: [{ item_id: "test", item_name: "Test", price: 1, quantity: 1 }],
      debug: true,
    });
    const mine = results.find(
      (r) =>
        r.measurement_id ===
        (typeof conn.config === "object" &&
        conn.config &&
        !Array.isArray(conn.config)
          ? String(
              (conn.config as Record<string, unknown>).measurement_id ??
                conn.account_external_id
            )
          : conn.account_external_id)
    );
    return { ok: mine?.ok ?? results.some((r) => r.ok), detail: mine ?? results };
  }

  if (conn.provider === "meta_ads") {
    if (!conn.access_token_cipher) throw new Error("missing_token");
    const token = await decryptSecret(conn.access_token_cipher);
    const adId = String(
      (typeof conn.config === "object" &&
      conn.config &&
      !Array.isArray(conn.config)
        ? (conn.config as Record<string, unknown>).ad_account_id
        : null) ?? conn.account_external_id ?? ""
    ).replace(/^act_/, "");
    const url = `${META_GRAPH_BASE_URL}/act_${adId}?fields=name,account_id&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = await res.json().catch(() => null);
    return { ok: res.ok, detail: body };
  }

  return { ok: true, detail: { note: "no_test_for_provider", provider: conn.provider } };
}

export async function updateFormLabel(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const default_event_name =
    String(formData.get("default_event_name") ?? "Lead").trim() || "Lead";
  if (!id || !label) throw new Error("missing_fields");
  await query(
    `update forms set label = $1, default_event_name = $2, updated_at = now() where id = $3`,
    [label, default_event_name, id]
  );
  revalidatePath("/dashboard/formularios");
}

/** Moeda padrão da stack (compras sem currency no payload). */
export async function updateStackCurrency(formData: FormData): Promise<void> {
  await requireUser();
  const currency =
    String(formData.get("currency") ?? "BRL").trim().toUpperCase() || "BRL";
  if (currency.length !== 3) throw new Error("currency_invalid");
  await query(
    `insert into settings (id, currency)
     values (1, $1)
     on conflict (id) do update set currency = excluded.currency, updated_at = now()`,
    [currency]
  );
  revalidateIntegrations("snippet");
}

/** test_event_code padrão Meta (fallback se o pixel não tiver o próprio). */
export async function updateMetaTestEventCode(
  formData: FormData
): Promise<void> {
  await requireUser();
  const test_event_code =
    String(formData.get("test_event_code") ?? "").trim() || null;
  await query(
    `insert into settings (id, test_event_code)
     values (1, $1)
     on conflict (id) do update set
       test_event_code = excluded.test_event_code,
       updated_at = now()`,
    [test_event_code]
  );
  revalidateIntegrations("meta_pixel");
}
