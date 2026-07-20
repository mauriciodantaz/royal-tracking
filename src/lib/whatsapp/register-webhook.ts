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
import {
  ensureShortWebhookUrl,
  shortWebhookUrl,
  webhookSlugFromConn,
} from "@/lib/integrations/webhook-slug";
import { metadataRecord } from "@/lib/rd/credentials";

export type WhatsappWebhookResult =
  | { ok: true; url: string; uazapiWebhookId?: string }
  | { ok: false; error: string };

type UazapiWebhookEntry = {
  id: string;
  url: string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function normalizeWebhookUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "").toLowerCase();
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

function pickId(rec: Record<string, unknown>): string | null {
  for (const key of ["id", "webhookId", "webhook_id", "ID"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickUrl(rec: Record<string, unknown>): string | null {
  for (const key of ["url", "webhookUrl", "webhook_url", "webhook"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Extract webhook id from UazAPI add/update response shapes. */
function extractUazapiWebhookId(body: unknown): string | null {
  const root = asRecord(body);
  if (!root) return null;

  const direct = pickId(root);
  if (direct) return direct;

  for (const key of ["webhook", "data", "result", "item"]) {
    const nested = asRecord(root[key]);
    if (!nested) continue;
    const id = pickId(nested);
    if (id) return id;
    const deeper = asRecord(nested.webhook);
    if (deeper) {
      const inner = pickId(deeper);
      if (inner) return inner;
    }
  }

  return null;
}

function collectWebhookEntries(node: unknown, out: UazapiWebhookEntry[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectWebhookEntries(item, out);
    return;
  }
  const rec = asRecord(node);
  if (!rec) return;

  const id = pickId(rec);
  const url = pickUrl(rec);
  if (id && url) {
    out.push({ id, url });
  }

  for (const value of Object.values(rec)) {
    if (value && typeof value === "object") {
      collectWebhookEntries(value, out);
    }
  }
}

async function listUazapiWebhooks(opts: {
  baseUrl: string;
  instanceToken: string;
}): Promise<UazapiWebhookEntry[]> {
  const endpoints = [`${opts.baseUrl}/webhook`, `${opts.baseUrl}/webhooks`];
  const headerVariants: Array<Record<string, string>> = [
    { Accept: "application/json", token: opts.instanceToken },
    { Accept: "application/json", Token: opts.instanceToken },
  ];

  for (const endpoint of endpoints) {
    for (const headers of headerVariants) {
      try {
        const res = await fetch(endpoint, { method: "GET", headers });
        if (!res.ok) continue;
        const body: unknown = await res.json().catch(() => null);
        const entries: UazapiWebhookEntry[] = [];
        collectWebhookEntries(body, entries);
        if (entries.length === 0) continue;
        const seen = new Set<string>();
        return entries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
      } catch {
        /* try next */
      }
    }
  }
  return [];
}

function findIdsByUrl(
  entries: UazapiWebhookEntry[],
  targetUrl: string
): string[] {
  const want = normalizeWebhookUrl(targetUrl);
  return entries
    .filter((e) => normalizeWebhookUrl(e.url) === want)
    .map((e) => e.id);
}

/** Match RT webhooks by exact URL or by /api/w/{slug} path (covers host variants). */
function findIdsForRoyalTrackingUrl(
  entries: UazapiWebhookEntry[],
  targetUrl: string,
  slug?: string | null
): string[] {
  const want = normalizeWebhookUrl(targetUrl);
  const slugPath = slug ? `/api/w/${slug}`.toLowerCase() : null;
  const ids = new Set<string>();
  for (const e of entries) {
    const u = normalizeWebhookUrl(e.url);
    if (u === want) {
      ids.add(e.id);
      continue;
    }
    if (slugPath && u.includes(slugPath)) {
      ids.add(e.id);
    }
  }
  return [...ids];
}

async function deleteUazapiWebhookById(opts: {
  baseUrl: string;
  instanceToken: string;
  id: string;
}): Promise<void> {
  const bodies = [
    { action: "delete", id: opts.id },
    { action: "delete", id: opts.id, enabled: false },
  ];
  const headerSets: Record<string, string>[] = [
    {
      "Content-Type": "application/json",
      token: opts.instanceToken,
    },
    {
      "Content-Type": "application/json",
      Token: opts.instanceToken,
    },
  ];

  for (const headers of headerSets) {
    for (const body of bodies) {
      try {
        const res = await fetch(`${opts.baseUrl}/webhook`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (res.ok) return;
        const text = await res.text().catch(() => "");
        console.error("[uazapi] delete webhook failed", {
          id: opts.id,
          status: res.status,
          body: text.slice(0, 200),
        });
      } catch (e) {
        console.error("[uazapi] delete webhook network error", {
          id: opts.id,
          error: e instanceof Error ? e.message : "rede",
        });
      }
    }
  }
}

/**
 * Keep a single RT webhook for this URL; delete duplicate RT entries.
 */
async function dedupeUazapiWebhooksByUrl(opts: {
  baseUrl: string;
  instanceToken: string;
  url: string;
  keepId: string;
}): Promise<void> {
  const entries = await listUazapiWebhooks({
    baseUrl: opts.baseUrl,
    instanceToken: opts.instanceToken,
  });
  const ids = findIdsByUrl(entries, opts.url);
  for (const id of ids) {
    if (id === opts.keepId) continue;
    await deleteUazapiWebhookById({
      baseUrl: opts.baseUrl,
      instanceToken: opts.instanceToken,
      id,
    });
  }
}

async function resolveUazapiWebhookId(opts: {
  baseUrl: string;
  instanceToken: string;
  url: string;
  preferredId?: string | null;
  responseBody?: unknown;
}): Promise<string | null> {
  const fromResponse = extractUazapiWebhookId(opts.responseBody);
  if (fromResponse) return fromResponse;
  if (opts.preferredId?.trim()) return opts.preferredId.trim();

  const entries = await listUazapiWebhooks({
    baseUrl: opts.baseUrl,
    instanceToken: opts.instanceToken,
  });
  const ids = findIdsByUrl(entries, opts.url);
  return ids[0] ?? null;
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

type EvolutionWebhookState = {
  enabled: boolean;
  url: string | null;
};

function isRoyalTrackingWebhookUrl(
  remoteUrl: string | null | undefined,
  ourUrl: string,
  slug?: string | null
): boolean {
  if (!remoteUrl) return false;
  const remote = normalizeWebhookUrl(remoteUrl);
  if (remote === normalizeWebhookUrl(ourUrl)) return true;
  if (slug && remote.includes(`/api/w/${slug}`.toLowerCase())) return true;
  return false;
}

async function findEvolutionWebhook(opts: {
  baseUrl: string;
  instanceName: string;
  instanceToken: string;
}): Promise<EvolutionWebhookState | null> {
  const endpoint = `${opts.baseUrl}/webhook/find/${encodeURIComponent(opts.instanceName)}`;
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: opts.instanceToken,
      },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    const root = asRecord(body);
    if (!root) return null;
    const nested = asRecord(root.webhook) ?? root;
    const url =
      typeof nested.url === "string"
        ? nested.url
        : typeof root.url === "string"
          ? root.url
          : null;
    const enabled = Boolean(
      nested.enabled ?? root.enabled ?? (url ? true : false)
    );
    return { enabled, url };
  } catch {
    return null;
  }
}

async function setEvolutionWebhook(opts: {
  baseUrl: string;
  instanceName: string;
  instanceToken: string;
  url: string;
  secret: string;
  enabled: boolean;
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
          enabled: opts.enabled,
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
 * Evolution only supports one webhook per instance.
 * Never overwrite a foreign URL — only set when empty/disabled or already ours.
 */
async function registerEvolutionWebhook(opts: {
  baseUrl: string;
  instanceName: string;
  instanceToken: string;
  url: string;
  secret: string;
  slug?: string | null;
}): Promise<WhatsappWebhookResult> {
  const current = await findEvolutionWebhook({
    baseUrl: opts.baseUrl,
    instanceName: opts.instanceName,
    instanceToken: opts.instanceToken,
  });

  if (
    current?.enabled &&
    current.url &&
    !isRoyalTrackingWebhookUrl(current.url, opts.url, opts.slug)
  ) {
    return {
      ok: false,
      error:
        `Esta instância Evolution já tem webhook em ${current.url}. ` +
        "A Evolution só permite um webhook por instância — use uma instância só para o Royal Tracking, " +
        "ou remova/desative o webhook atual antes de configurar.",
    };
  }

  return setEvolutionWebhook({
    baseUrl: opts.baseUrl,
    instanceName: opts.instanceName,
    instanceToken: opts.instanceToken,
    url: opts.url,
    secret: opts.secret,
    enabled: true,
  });
}

/**
 * If the instance webhook still points at this RT URL, disable it.
 * Does not touch foreign webhooks.
 */
export async function cleanupEvolutionWebhook(
  conn: IntegrationConnectionRow
): Promise<void> {
  if (conn.provider !== "evolution_api") return;

  const baseUrlRaw = configString(conn, "base_url");
  const instanceName = configString(conn, "instance_name");
  const instanceToken = await decryptAccessToken(conn);
  if (!baseUrlRaw || !instanceName || !instanceToken) return;

  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const slug = webhookSlugFromConn(conn);
  const meta = metadataRecord(conn.metadata);
  const wh = asRecord(meta.whatsapp_webhook);
  const storedUrl =
    wh && typeof wh.url === "string" ? wh.url : null;
  const ourUrl = storedUrl || (slug ? shortWebhookUrl(slug) : null);
  if (!ourUrl) return;

  const current = await findEvolutionWebhook({
    baseUrl,
    instanceName,
    instanceToken,
  });
  if (!current?.url) return;
  if (!isRoyalTrackingWebhookUrl(current.url, ourUrl, slug)) return;

  const secret = (await decryptWebhookSecret(conn)) || "cleanup";
  await setEvolutionWebhook({
    baseUrl,
    instanceName,
    instanceToken,
    url: ourUrl,
    secret,
    enabled: false,
  });
}

/**
 * Advanced mode only: action add (new) or update (our id).
 * Never uses simple mode (would overwrite the instance's single webhook).
 * Before add, reuses existing webhook with the same URL (avoids duplicates).
 */
async function registerUazapiWebhook(opts: {
  baseUrl: string;
  instanceToken: string;
  url: string;
  existingWebhookId?: string | null;
}): Promise<WhatsappWebhookResult> {
  const endpoint = `${opts.baseUrl}/webhook`;

  let existingId = opts.existingWebhookId?.trim() || null;
  if (!existingId) {
    const listed = await listUazapiWebhooks({
      baseUrl: opts.baseUrl,
      instanceToken: opts.instanceToken,
    });
    const byUrl = findIdsByUrl(listed, opts.url);
    existingId = byUrl[0] ?? null;
  }

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

  const parsedId = await resolveUazapiWebhookId({
    baseUrl: opts.baseUrl,
    instanceToken: opts.instanceToken,
    url: opts.url,
    preferredId: existingId,
    responseBody: body,
  });

  if (!parsedId) {
    return {
      ok: false,
      error:
        "UazAPI aceitou o webhook, mas não foi possível obter o ID (resposta nem listagem).",
    };
  }

  // Remove accidental duplicates created by earlier failed retries.
  await dedupeUazapiWebhooksByUrl({
    baseUrl: opts.baseUrl,
    instanceToken: opts.instanceToken,
    url: opts.url,
    keepId: parsedId,
  });

  return { ok: true, url: opts.url, uazapiWebhookId: parsedId };
}

/**
 * Remove Royal Tracking webhooks on UazAPI (ours only).
 * Resolves URL from slug even when metadata is pending/missing ID.
 * Deletes every webhook that points at this connection's /api/w/{slug}.
 */
export async function cleanupUazapiWebhook(
  conn: IntegrationConnectionRow
): Promise<void> {
  if (conn.provider !== "uazapi") return;

  const baseUrlRaw = configString(conn, "base_url");
  const instanceToken = await decryptAccessToken(conn);
  if (!baseUrlRaw || !instanceToken) {
    console.error("[uazapi] cleanup skipped: missing base_url or token", {
      connectionId: conn.id,
    });
    return;
  }

  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const slug = webhookSlugFromConn(conn);
  const meta = metadataRecord(conn.metadata);
  const wh = asRecord(meta.whatsapp_webhook);
  const storedUrl =
    wh && typeof wh.url === "string" ? wh.url.trim() : null;
  const targetUrl =
    storedUrl || (slug ? shortWebhookUrl(slug) : null) || null;

  const idsToDelete = new Set<string>();
  const storedId = readStoredUazapiWebhookId(conn);
  if (storedId) idsToDelete.add(storedId);

  const entries = await listUazapiWebhooks({ baseUrl, instanceToken });
  if (targetUrl) {
    for (const id of findIdsForRoyalTrackingUrl(entries, targetUrl, slug)) {
      idsToDelete.add(id);
    }
  } else if (slug) {
    for (const id of findIdsForRoyalTrackingUrl(entries, "", slug)) {
      idsToDelete.add(id);
    }
  }

  if (idsToDelete.size === 0) {
    console.error("[uazapi] cleanup: no webhook ids found to delete", {
      connectionId: conn.id,
      targetUrl,
      slug,
      listed: entries.length,
    });
    return;
  }

  for (const id of idsToDelete) {
    await deleteUazapiWebhookById({ baseUrl, instanceToken, id });
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
  conn = (await getConnection(connectionId))!;
  const slug = webhookSlugFromConn(conn);
  const existingUazapiId =
    conn.provider === "uazapi" ? readStoredUazapiWebhookId(conn) : null;

  // Already healthy: do not hit the provider again (avoids overwrite/dup on page load).
  {
    const meta = metadataRecord(conn.metadata);
    const wh = asRecord(meta.whatsapp_webhook);
    const status = wh && typeof wh.status === "string" ? wh.status : null;
    const storedUrl = wh && typeof wh.url === "string" ? wh.url : null;
    const urlOk =
      status === "ok" &&
      storedUrl &&
      normalizeWebhookUrl(storedUrl) === normalizeWebhookUrl(url);
    if (urlOk && conn.provider === "uazapi" && existingUazapiId) {
      return { ok: true, url, uazapiWebhookId: existingUazapiId };
    }
    if (urlOk && conn.provider === "evolution_api") {
      return { ok: true, url };
    }
  }

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
        slug,
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
    // Always keep url so cleanup can still find/delete RT webhooks by path.
    const wh: Record<string, Json> = {
      status: "pending",
      message: result.error,
      url,
      updated_at: new Date().toISOString(),
    };
    if (existingUazapiId) {
      wh.uazapi_webhook_id = existingUazapiId;
    }
    await patchMetadata(connectionId, { whatsapp_webhook: wh });
  }

  return result;
}
