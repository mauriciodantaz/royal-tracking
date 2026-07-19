import "server-only";

import { randomBytes } from "node:crypto";

import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import {
  configString,
  getConnection,
} from "@/lib/integrations/connections";

const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;

/** Short public slug for listen-only inbound URLs (~12 chars). */
export async function ensureWebhookSlug(
  connectionId: string
): Promise<string> {
  let conn = await getConnection(connectionId);
  if (!conn) throw new Error("Conexão não encontrada.");

  const existing = configString(conn, "webhook_slug");
  if (existing && SLUG_RE.test(existing)) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomBytes(9).toString("base64url");
    const taken = await queryOne<{ id: string }>(
      `select id from integration_connections
       where config->>'webhook_slug' = $1
       limit 1`,
      [slug]
    );
    if (taken) continue;
    await query(
      `update integration_connections set
         config = coalesce(config, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
       where id = $2`,
      [JSON.stringify({ webhook_slug: slug }), connectionId]
    );
    return slug;
  }
  throw new Error("Não foi possível gerar slug curto do webhook.");
}

export function shortWebhookUrl(slug: string): string {
  const appUrl = getAppUrl().replace(/\/$/, "");
  return `${appUrl}/api/w/${slug}`;
}

export async function ensureShortWebhookUrl(
  connectionId: string
): Promise<string> {
  const slug = await ensureWebhookSlug(connectionId);
  return shortWebhookUrl(slug);
}

export function isValidWebhookSlug(slug: string): boolean {
  return SLUG_RE.test(slug.trim());
}

export function webhookSlugFromConn(
  conn: IntegrationConnectionRow
): string | null {
  const slug = configString(conn, "webhook_slug");
  return slug && SLUG_RE.test(slug) ? slug : null;
}
