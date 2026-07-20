import "server-only";

import { randomBytes } from "node:crypto";

import { encryptSecret } from "@/lib/crypto/secrets";
import { query } from "@/lib/db/pool";
import type { IntegrationConnectionRow, Json } from "@/lib/db/types";
import {
  configString,
  decryptAccessToken,
  decryptWebhookSecret,
  getConnection,
} from "@/lib/integrations/connections";
import { ensureShortWebhookUrl } from "@/lib/integrations/webhook-slug";
import { metadataRecord } from "@/lib/rd/credentials";

export type WhatsappWebhookResult =
  | { ok: true; url: string; uazapiWebhookId?: string }
  | { ok: false; error: string };

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function readStoredUazapiWebhookId(
  conn: IntegrationConnectionRow
): string | null {
  const meta = metadataRecord(conn.metadata);
  const wh = asRecord(meta.whatsapp_webhook);
  if (!wh) return null;
  const id = wh.uazapi_webhook_id ?? wh.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Extract webhook id from UazAPI add/update response shapes. */
function extractUazapiWebhookId(body: unknown): string | null {
  const root = asRecord(body);
  if (!root) return null;

  const direct = root.id ?? root.webhookId ?? root.webhook_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const webhook = asRecord(root.webhook);
  if (webhook) {
    const nested = webhook.id ?? webhook.webhookId ?? webhook.webhook_id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  const data = asRecord(root.data);
  if (data) {
    const nested = data.id ?? data.webhookId ?? data.webhook_id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    const dataWh = asRecord(data.webhook);
    if (dataWh) {
      const inner = dataWh.id ?? dataWh.webhookId ?? dataWh.webhook_id;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
  }

  return null;
}

async function ensureWebhookSecret(
  conn: IntegrationConnectionRow
): Promise<string> {
  const existing = await decryptWebhookSecret(conn);
  if (existing) return existing;
  const secret = randomBytes(24).toString("hex");
  const cipher = await encryptSecret(secret);
  await query(
    `update integration_connections set
       webhook_secret_cipher = $1,
       updated_at = now()
     where id = $2`,
    [cipher, conn.id]
  );
  return secret;
}

async function patchMetadata(
  connectionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await query(
    `update integration_connections set
       metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
       updated_at = now()
     where id = $2`,
    [JSON.stringify(patch), connectionId]
  );
}

async function registerEvolutionWebhook(opts: {
  baseUrl: string;
  instanceName: string;
  instanceToken: string;
  url: string;
  secret: string;
}): Promise<WhatsappWebhookResult> {
  const endpoint = `${opts.baseUrl}/webhook/set/${encodeURIComponent(opts.instanceName)}`;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: opts.instanceToken,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: opts.url,
          byEvents: false,
          base64: false,
          headers: {
            "x-webhook-token": opts.secret,
          },
          events: ["MESSAGES_UPSERT"],
        },
      }),
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar a Evolution: ${e instanceof Error ? e.message : "rede"}`,
    };
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : `HTTP ${res.status}`;
    return { ok: false, error: `Evolution recusou o webhook: ${msg}` };
  }

  return { ok: true, url: opts.url };
}

/**
 * Advanced mode only: action add (new) or update (our id).
 * Never uses simple mode (would overwrite the instance's single webhook).
 */
async function registerUazapiWebhook(opts: {
  baseUrl: string;
  instanceToken: string;
  url: string;
  existingWebhookId?: string | null;
}): Promise<WhatsappWebhookResult> {
  const endpoint = `${opts.baseUrl}/webhook`;
  const existingId = opts.existingWebhookId?.trim() || null;
  const payload: Record<string, unknown> = {
    enabled: true,
    url: opts.url,
    events: ["messages"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: false,
    addUrlTypesMessages: false,
    action: existingId ? "update" : "add",
  };
  if (existingId) {
    payload.id = existingId;
  }

  let res: Response;
  let body: unknown;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: opts.instanceToken,
      },
      body: JSON.stringify(payload),
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar a UazAPI: ${e instanceof Error ? e.message : "rede"}`,
    };
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object"
        ? JSON.stringify(body).slice(0, 240)
        : `HTTP ${res.status}`;
    return { ok: false, error: `UazAPI recusou o webhook: ${msg}` };
  }

  const parsedId = extractUazapiWebhookId(body) ?? existingId;
  if (!parsedId) {
    return {
      ok: false,
      error:
        "UazAPI aceitou o webhook, mas não devolveu o ID. Não é seguro reconfigurar sem o ID.",
    };
  }

  return { ok: true, url: opts.url, uazapiWebhookId: parsedId };
}

/**
 * Remove only the webhook created by Royal Tracking (action delete + id).
 * Best-effort — does not throw if UazAPI is unreachable.
 */
export async function cleanupUazapiWebhook(
  conn: IntegrationConnectionRow
): Promise<void> {
  if (conn.provider !== "uazapi") return;

  const webhookId = readStoredUazapiWebhookId(conn);
  if (!webhookId) return;

  const baseUrlRaw = configString(conn, "base_url");
  const instanceToken = await decryptAccessToken(conn);
  if (!baseUrlRaw || !instanceToken) return;

  const endpoint = `${normalizeBaseUrl(baseUrlRaw)}/webhook`;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instanceToken,
      },
      body: JSON.stringify({ action: "delete", id: webhookId }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * RD Conversas (Tallos): short listen-only URL — operator pastes in Tallos UI.
 */
async function ensureRdConversasWebhook(
  connectionId: string,
  conn: IntegrationConnectionRow
): Promise<WhatsappWebhookResult> {
  await ensureWebhookSecret(conn);
  const url = await ensureShortWebhookUrl(connectionId);
  await patchMetadata(connectionId, {
    whatsapp_webhook: {
      status: "ok",
      message:
        "Cole no Tallos: Integração com Webhook (POST) e ative todas as opções",
      url,
      updated_at: new Date().toISOString(),
    },
  });
  return { ok: true, url };
}

/**
 * Ensure inbound secret + short slug, register on Evolution / UazAPI,
 * or prepare the manual Tallos URL for RD Conversas.
 */
export async function ensureWhatsappWebhook(
  connectionId: string
): Promise<WhatsappWebhookResult> {
  let conn = await getConnection(connectionId);
  if (!conn) {
    return { ok: false, error: "Conexão não encontrada." };
  }
  if (
    conn.provider !== "evolution_api" &&
    conn.provider !== "uazapi" &&
    conn.provider !== "rdstation_conversas"
  ) {
    return { ok: false, error: "Provedor não é WhatsApp." };
  }

  if (conn.provider === "rdstation_conversas") {
    return ensureRdConversasWebhook(connectionId, conn);
  }

  const secret = await ensureWebhookSecret(conn);
  conn = (await getConnection(connectionId))!;

  const baseUrlRaw = configString(conn, "base_url");
  if (!baseUrlRaw) {
    const err = "Informe a Base URL da instância.";
    await patchMetadata(connectionId, {
      whatsapp_webhook: {
        status: "error",
        message: err,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: false, error: err };
  }
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const instanceToken = await decryptAccessToken(conn);
  if (!instanceToken) {
    const err = "Informe o token / API key da instância.";
    await patchMetadata(connectionId, {
      whatsapp_webhook: {
        status: "error",
        message: err,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: false, error: err };
  }

  const url = await ensureShortWebhookUrl(connectionId);
  const existingUazapiId =
    conn.provider === "uazapi" ? readStoredUazapiWebhookId(conn) : null;

  let result: WhatsappWebhookResult;
  if (conn.provider === "evolution_api") {
    const instanceName = configString(conn, "instance_name");
    if (!instanceName) {
      result = { ok: false, error: "Informe o nome da instância Evolution." };
    } else {
      result = await registerEvolutionWebhook({
        baseUrl,
        instanceName,
        instanceToken,
        url,
        secret,
      });
    }
  } else {
    result = await registerUazapiWebhook({
      baseUrl,
      instanceToken,
      url,
      existingWebhookId: existingUazapiId,
    });
  }

  if (result.ok) {
    const wh: Record<string, Json> = {
      status: "ok",
      message: "Webhook configurado",
      url: result.url,
      updated_at: new Date().toISOString(),
    };
    if (result.uazapiWebhookId) {
      wh.uazapi_webhook_id = result.uazapiWebhookId;
    } else if (existingUazapiId) {
      wh.uazapi_webhook_id = existingUazapiId;
    }
    await patchMetadata(connectionId, { whatsapp_webhook: wh });
  } else {
    const wh: Record<string, Json> = {
      status: "pending",
      message: result.error,
      updated_at: new Date().toISOString(),
    };
    if (existingUazapiId) {
      wh.uazapi_webhook_id = existingUazapiId;
    }
    await patchMetadata(connectionId, { whatsapp_webhook: wh });
  }

  return result;
}
