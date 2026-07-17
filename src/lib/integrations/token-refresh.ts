import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  metadataRecord,
  requestRdToken,
  resolveRdCredentials,
} from "@/lib/rd/credentials";

/**
 * Lazy OAuth refresh — call before using access token.
 * RD: credentials from connection config (UI), env as legacy fallback.
 * CRM uses oauth2/token (form); Marketing uses auth/token (JSON).
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
  let tokenBodyFormat: "json" | "form" = "json";

  if (
    conn.provider === "rdstation_crm" ||
    conn.provider === "rdstation_mkt"
  ) {
    const creds = await resolveRdCredentials(conn, conn.provider);
    if (!creds) {
      return markNeedsReauth(conn, "missing_oauth_app_credentials");
    }
    clientId = creds.clientId;
    clientSecret = creds.clientSecret;
    tokenUrl = creds.tokenUrl;
    tokenBodyFormat = creds.tokenBodyFormat;
  } else if (conn.provider === "google_ads") {
    clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    tokenUrl = "https://oauth2.googleapis.com/token";
    tokenBodyFormat = "form";
  }

  if (!clientId || !clientSecret) return conn;

  const refresh = await decryptSecret(conn.refresh_token_cipher);

  let accessToken: string | undefined;
  let newRefresh: string | undefined;
  let expiresIn: number | undefined;

  if (
    conn.provider === "rdstation_crm" ||
    conn.provider === "rdstation_mkt"
  ) {
    const { ok, json } = await requestRdToken({
      tokenUrl,
      tokenBodyFormat,
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      },
    });
    if (!ok || !json?.access_token) {
      return markNeedsReauth(conn, "refresh_failed");
    }
    accessToken = json.access_token;
    newRefresh = json.refresh_token;
    expiresIn = json.expires_in;
  } else {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }).toString(),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    } | null;
    if (!res.ok || !json?.access_token) {
      return markNeedsReauth(conn, "refresh_failed");
    }
    accessToken = json.access_token;
    newRefresh = json.refresh_token;
    expiresIn = json.expires_in;
  }

  await ensureDbReady();
  const accessCipher = await encryptSecret(accessToken);
  const refreshCipher = newRefresh
    ? await encryptSecret(newRefresh)
    : conn.refresh_token_cipher;
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const meta = metadataRecord(conn.metadata);
  delete meta.needs_reauth;
  delete meta.reauth_reason;
  meta.last_refresh_at = new Date().toISOString();

  await query(
    `update integration_connections set
       access_token_cipher = $1,
       refresh_token_cipher = $2,
       expires_at = $3,
       metadata = $4::jsonb,
       updated_at = now()
     where id = $5`,
    [
      accessCipher,
      refreshCipher,
      expiresAt,
      JSON.stringify(meta),
      conn.id,
    ]
  );

  const updated = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [conn.id]
  );
  return updated ?? conn;
}

async function markNeedsReauth(
  conn: IntegrationConnectionRow,
  reason: string
): Promise<IntegrationConnectionRow> {
  await ensureDbReady();
  const meta = metadataRecord(conn.metadata);
  meta.needs_reauth = true;
  meta.reauth_reason = reason;
  await query(
    `update integration_connections set
       metadata = $1::jsonb,
       updated_at = now()
     where id = $2`,
    [JSON.stringify(meta), conn.id]
  );
  const updated = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [conn.id]
  );
  return (
    updated ?? {
      ...conn,
      metadata: meta as IntegrationConnectionRow["metadata"],
    }
  );
}
