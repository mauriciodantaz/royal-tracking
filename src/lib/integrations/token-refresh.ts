import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";

/**
 * Lazy OAuth refresh — call before using access token.
 * Supports RD Station token endpoint shape.
 */
export async function refreshConnectionIfNeeded(
  conn: IntegrationConnectionRow
): Promise<IntegrationConnectionRow> {
  if (conn.auth_type !== "oauth" || !conn.refresh_token_cipher) {
    return conn;
  }
  if (conn.expires_at) {
    const exp = new Date(conn.expires_at).getTime();
    if (exp - Date.now() > 60_000) return conn;
  }

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let tokenUrl = "https://api.rd.services/auth/token";

  if (conn.provider === "rdstation_crm") {
    clientId = process.env.RDSTATION_CRM_CLIENT_ID;
    clientSecret = process.env.RDSTATION_CRM_CLIENT_SECRET;
  } else if (conn.provider === "rdstation_mkt") {
    clientId = process.env.RDSTATION_MKT_CLIENT_ID;
    clientSecret = process.env.RDSTATION_MKT_CLIENT_SECRET;
  } else if (conn.provider === "google_ads") {
    clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    tokenUrl = "https://oauth2.googleapis.com/token";
  }

  if (!clientId || !clientSecret) return conn;

  const refresh = await decryptSecret(conn.refresh_token_cipher);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  if (!res.ok || !json?.access_token) return conn;

  await ensureDbReady();
  const accessCipher = await encryptSecret(json.access_token);
  const refreshCipher = json.refresh_token
    ? await encryptSecret(json.refresh_token)
    : conn.refresh_token_cipher;
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;

  await query(
    `update integration_connections set
       access_token_cipher = $1,
       refresh_token_cipher = $2,
       expires_at = $3,
       updated_at = now()
     where id = $4`,
    [accessCipher, refreshCipher, expiresAt, conn.id]
  );

  const updated = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [conn.id]
  );
  return updated ?? conn;
}
