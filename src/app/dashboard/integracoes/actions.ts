"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  seedDefaultMappingsForOutbound,
} from "@/lib/integrations/connections";
import {
  getModule,
  isIntegrationProvider,
  isUiVisibleProvider,
} from "@/lib/integrations/registry";
import { validateIntegrationCredentials } from "@/lib/integrations/validate-credentials";
import {
  cleanupRdWebhooks,
  ensureRdWebhooks,
  syncRdFunnels,
} from "@/lib/rd/sync";

function revalidateIntegrations(provider?: string) {
  revalidatePath("/dashboard/integracoes");
  if (provider) {
    revalidatePath(`/dashboard/integracoes/${provider}`);
  }
  revalidatePath("/dashboard/campanhas");
}

export async function upsertConnection(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const provider = String(formData.get("provider") ?? "").trim();
  if (!isIntegrationProvider(provider)) {
    return { ok: false, error: "Provedor de integração inválido." };
  }
  if (!isUiVisibleProvider(provider)) {
    return { ok: false, error: "Este módulo está temporariamente indisponível." };
  }

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

  const clientSecret = String(formData.get("client_secret") ?? "").trim();
  const isRdOAuth =
    provider === "rdstation_crm" || provider === "rdstation_mkt";

  const accountExternalId =
    config.pixel_id ||
    config.measurement_id ||
    config.ad_account_id ||
    String(formData.get("account_external_id") ?? "").trim() ||
    null;

  let accessCipher: string | null = null;
  if (accessToken) {
    accessCipher = await encryptSecret(accessToken);
  }
  let webhookCipher: string | null = null;
  if (webhookSecret) {
    webhookCipher = await encryptSecret(webhookSecret);
  }
  let refreshCipher: string | null = null;
  if (refreshToken) {
    refreshCipher = await encryptSecret(refreshToken);
  }

  let tokenForValidation = accessToken;
  let webhookForValidation = webhookSecret;
  let existingClientSecretCipher: string | null = null;

  if (id) {
    const existing = await queryOne<IntegrationConnectionRow>(
      `select * from integration_connections where id = $1`,
      [id]
    );
    if (existing) {
      if (!tokenForValidation && existing.access_token_cipher) {
        try {
          tokenForValidation = await decryptSecret(existing.access_token_cipher);
        } catch {
          /* ignore */
        }
      }
      if (!webhookForValidation && existing.webhook_secret_cipher) {
        try {
          webhookForValidation = await decryptSecret(
            existing.webhook_secret_cipher
          );
        } catch {
          /* ignore */
        }
      }
      if (!config.pixel_id && existing.account_external_id && provider === "meta_pixel") {
        config.pixel_id = existing.account_external_id;
      }
      if (
        !config.measurement_id &&
        existing.account_external_id &&
        provider === "ga4"
      ) {
        config.measurement_id = existing.account_external_id;
      }
      if (
        !config.ad_account_id &&
        existing.account_external_id &&
        provider === "meta_ads"
      ) {
        config.ad_account_id = existing.account_external_id;
      }
      if (isRdOAuth) {
        const cfg =
          existing.config &&
          typeof existing.config === "object" &&
          !Array.isArray(existing.config)
            ? (existing.config as Record<string, unknown>)
            : {};
        if (!config.client_id && typeof cfg.client_id === "string") {
          config.client_id = cfg.client_id;
        }
        if (typeof cfg.client_secret_cipher === "string") {
          existingClientSecretCipher = cfg.client_secret_cipher;
        }
      }
    }
  }

  if (isRdOAuth) {
    if (clientSecret) {
      config.client_secret_cipher = await encryptSecret(clientSecret);
    } else if (existingClientSecretCipher) {
      config.client_secret_cipher = existingClientSecretCipher;
    } else {
      return {
        ok: false,
        error: "Informe o Client Secret do app RD App Store.",
      };
    }
    if (!config.client_id?.trim()) {
      return { ok: false, error: "Informe o Client ID do app RD App Store." };
    }
  }

  if (mod.authType === "token" && !tokenForValidation && provider !== "snippet") {
    return { ok: false, error: "Informe o token / API secret para validar o acesso." };
  }
  if (mod.authType === "webhook_secret" && !webhookForValidation) {
    return { ok: false, error: "Informe o webhook token para salvar a integração." };
  }

  const validation = await validateIntegrationCredentials({
    provider,
    accessToken: tokenForValidation,
    webhookSecret: webhookForValidation,
    config: {
      ...config,
      ...(accountExternalId && !config.account_external_id
        ? { account_external_id: accountExternalId }
        : {}),
    },
  });

  if (!validation.ok) {
    return {
      ok: false,
      error:
        validation.error ||
        "Não foi possível validar o acesso na plataforma. Verifique as credenciais.",
    };
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
  if (
    conn &&
    (conn.provider === "rdstation_crm" || conn.provider === "rdstation_mkt")
  ) {
    try {
      await cleanupRdWebhooks(conn);
    } catch {
      /* best-effort */
    }
  }
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

export async function syncRdFunnelsAction(
  connectionId: string
): Promise<{ ok: true; pipelines: number; stages: number } | { ok: false; error: string }> {
  await requireUser();
  try {
    const result = await syncRdFunnels(connectionId);
    try {
      await ensureRdWebhooks(connectionId);
    } catch (err) {
      console.error("[rd] ensureRdWebhooks", err);
    }
    const conn = await queryOne<IntegrationConnectionRow>(
      `select provider from integration_connections where id = $1`,
      [connectionId]
    );
    revalidateIntegrations(conn?.provider);
    return { ok: true, ...result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao sincronizar funis",
    };
  }
}

export async function saveRdStageMapsAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  if (!connectionId) {
    return { ok: false, error: "connection_id obrigatório" };
  }

  const conn = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [connectionId]
  );
  if (
    !conn ||
    (conn.provider !== "rdstation_crm" && conn.provider !== "rdstation_mkt")
  ) {
    return { ok: false, error: "Conexão RD inválida" };
  }

  const mapsJson = String(formData.get("maps") ?? "").trim();
  let maps: Array<{
    id?: string;
    stage_external_id?: string | null;
    mkt_lifecycle?: string | null;
    deal_status?: string | null;
    meta_event_name?: string | null;
    ga4_event_name?: string | null;
  }> = [];
  try {
    maps = JSON.parse(mapsJson) as typeof maps;
  } catch {
    return { ok: false, error: "JSON de mapeamentos inválido" };
  }

  for (const m of maps) {
    const meta =
      m.meta_event_name != null && String(m.meta_event_name).trim()
        ? String(m.meta_event_name).trim()
        : null;
    const ga4 =
      m.ga4_event_name != null && String(m.ga4_event_name).trim()
        ? String(m.ga4_event_name).trim()
        : null;
    const dealStatus =
      m.deal_status === "won" || m.deal_status === "lost"
        ? m.deal_status
        : null;

    if (m.id) {
      await query(
        `update rd_stage_event_maps set
           meta_event_name = $1,
           ga4_event_name = $2,
           updated_at = now()
         where id = $3 and connection_id = $4`,
        [meta, ga4, m.id, connectionId]
      );
    } else if (m.stage_external_id) {
      await query(
        `insert into rd_stage_event_maps (
           connection_id, stage_external_id, meta_event_name, ga4_event_name, updated_at
         ) values ($1,$2,$3,$4, now())`,
        [connectionId, m.stage_external_id, meta, ga4]
      );
    } else if (m.mkt_lifecycle) {
      await query(
        `insert into rd_stage_event_maps (
           connection_id, mkt_lifecycle, meta_event_name, ga4_event_name, updated_at
         ) values ($1,$2,$3,$4, now())`,
        [connectionId, m.mkt_lifecycle, meta, ga4]
      );
    } else if (dealStatus) {
      const existing = await queryOne<{ id: string }>(
        `select id from rd_stage_event_maps
         where connection_id = $1 and deal_status = $2 limit 1`,
        [connectionId, dealStatus]
      );
      if (existing) {
        await query(
          `update rd_stage_event_maps set
             meta_event_name = $1,
             ga4_event_name = $2,
             updated_at = now()
           where id = $3 and connection_id = $4`,
          [meta, ga4, existing.id, connectionId]
        );
      } else {
        await query(
          `insert into rd_stage_event_maps (
             connection_id, deal_status, meta_event_name, ga4_event_name, updated_at
           ) values ($1,$2,$3,$4, now())`,
          [connectionId, dealStatus, meta, ga4]
        );
      }
    }
  }

  try {
    await ensureRdWebhooks(connectionId);
  } catch (err) {
    console.error("[rd] ensureRdWebhooks after maps", err);
  }

  revalidateIntegrations(conn.provider);
  return { ok: true };
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
