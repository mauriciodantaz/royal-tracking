import "server-only";

import { randomBytes } from "node:crypto";

import { encryptSecret } from "@/lib/crypto/secrets";
import { query } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import {
  configString,
  decryptAccessToken,
  decryptWebhookSecret,
  getConnection,
} from "@/lib/integrations/connections";

export type WhatsappWebhookResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
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
  inboundUrl: string;
  secret: string;
}): Promise<WhatsappWebhookResult> {
  const url = `${opts.inboundUrl}?token=${encodeURIComponent(opts.secret)}`;
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
          url,
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

  return { ok: true, url };
}

async function registerUazapiWebhook(opts: {
  baseUrl: string;
  instanceToken: string;
  inboundUrl: string;
  secret: string;
}): Promise<WhatsappWebhookResult> {
  const url = `${opts.inboundUrl}?token=${encodeURIComponent(opts.secret)}`;
  const endpoint = `${opts.baseUrl}/webhook`;
  const payload = {
    enabled: true,
    url,
    webhookUrl: url,
    events: ["messages"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };

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

  return { ok: true, url };
}

/**
 * RD Conversas (Tallos): secret + URL only — operator pastes URL in Tallos UI.
 */
async function ensureRdConversasWebhook(
  connectionId: string,
  conn: IntegrationConnectionRow
): Promise<WhatsappWebhookResult> {
  const secret = await ensureWebhookSecret(conn);
  const appUrl = getAppUrl().replace(/\/$/, "");
  const url = `${appUrl}/api/webhook/in/${conn.id}?token=${encodeURIComponent(secret)}`;
  await patchMetadata(connectionId, {
    whatsapp_webhook: {
      status: "ok",
      message:
        "Cole esta URL em Tallos → Integrações → Webhooks (app.tallos.com.br)",
      url,
      updated_at: new Date().toISOString(),
    },
  });
  return { ok: true, url };
}

/**
 * Ensure inbound secret exists and register webhook on Evolution / UazAPI,
 * or prepare the manual Tallos URL for RD Conversas.
 * Connection is kept even if remote registration fails (status in metadata).
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

  const appUrl = getAppUrl().replace(/\/$/, "");
  const inboundUrl = `${appUrl}/api/webhook/in/${conn.id}`;

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
        inboundUrl,
        secret,
      });
    }
  } else {
    result = await registerUazapiWebhook({
      baseUrl,
      instanceToken,
      inboundUrl,
      secret,
    });
  }

  if (result.ok) {
    await patchMetadata(connectionId, {
      whatsapp_webhook: {
        status: "ok",
        message: "Webhook configurado",
        url: result.url,
        updated_at: new Date().toISOString(),
      },
    });
  } else {
    await patchMetadata(connectionId, {
      whatsapp_webhook: {
        status: "pending",
        message: result.error,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return result;
}
