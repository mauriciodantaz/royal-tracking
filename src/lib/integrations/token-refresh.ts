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

/** In-process lock: RD rotates refresh_token; parallel refreshes invalidate each other. */
const refreshInFlight = new Map<string, Promise<IntegrationConnectionRow>>();

function tokenStillValid(
  expiresAt: string | null | undefined,
  skewMs = 60_000
): boolean {
  if (!expiresAt) return false;
  const exp = new Date(expiresAt).getTime();
  return Number.isFinite(exp) && exp - Date.now() > skewMs;
}

/**
 * Lazy OAuth refresh — call before using access token.
 * RD: credentials from connection config (UI), env as legacy fallback.
 * CRM uses oauth2/token (form); Marketing uses auth/token (JSON).
 *
 * RD returns a new refresh_token on every refresh (rotation). Concurrent
 * refreshes must be serialized / race-healed so a loser does not sticky-mark
 * needs_reauth after the winner already saved valid tokens.
 */
export async function refreshConnectionIfNeeded(
  conn: IntegrationConnectionRow
): Promise<IntegrationConnectionRow> {
  if (conn.auth_type !== "oauth" || !conn.refresh_token_cipher) {
    return conn;
  }

  const healed = await healStickyReauthIfTokenValid(conn);
  if (healed) return healed;
  if (tokenStillValid(conn.expires_at)) return conn;

  const existing = refreshInFlight.get(conn.id);
  if (existing) return existing;

  const promise = doRefresh(conn).finally(() => {
    if (refreshInFlight.get(conn.id) === promise) {
      refreshInFlight.delete(conn.id);
    }
  });
  refreshInFlight.set(conn.id, promise);
  return promise;
}

/** Clear needs_reauth when another worker already rotated tokens successfully. */
async function healStickyReauthIfTokenValid(
  conn: IntegrationConnectionRow
): Promise<IntegrationConnectionRow | null> {
  if (!tokenStillValid(conn.expires_at)) return null;
  const meta = metadataRecord(conn.metadata);
  if (meta.needs_reauth !== true) return null;

  await ensureDbReady();
  const latest = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [conn.id]
  );
  if (!latest || !tokenStillValid(latest.expires_at)) return null;

  const latestMeta = metadataRecord(latest.metadata);
  if (latestMeta.needs_reauth !== true) return latest;

  delete latestMeta.needs_reauth;
  delete latestMeta.reauth_reason;
  latestMeta.reauth_healed_at = new Date().toISOString();

  await query(
    `update integration_connections set
       metadata = $1::jsonb,
       updated_at = now()
     where id = $2`,
    [JSON.stringify(latestMeta), latest.id]
  );

  return (
    (await queryOne<IntegrationConnectionRow>(
      `select * from integration_connections where id = $1`,
      [latest.id]
    )) ?? { ...latest, metadata: latestMeta as IntegrationConnectionRow["metadata"] }
  );
}

async function doRefresh(
  conn: IntegrationConnectionRow
): Promise<IntegrationConnectionRow> {
  await ensureDbReady();

  // Re-read: another request may have refreshed while we waited on the lock.
  const latest =
    (await queryOne<IntegrationConnectionRow>(
      `select * from integration_connections where id = $1`,
      [conn.id]
    )) ?? conn;

  const healed = await healStickyReauthIfTokenValid(latest);
  if (healed) return healed;
  if (tokenStillValid(latest.expires_at)) return latest;
  if (!latest.refresh_token_cipher) return latest;

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let tokenUrl = "https://api.rd.services/auth/token";
  let tokenBodyFormat: "json" | "form" = "json";

  if (
    latest.provider === "rdstation_crm" ||
    latest.provider === "rdstation_mkt"
  ) {
    const creds = await resolveRdCredentials(latest, latest.provider);
    if (!creds) {
      return markNeedsReauth(latest, "missing_oauth_app_credentials");
    }
    clientId = creds.clientId;
    clientSecret = creds.clientSecret;
    tokenUrl = creds.tokenUrl;
    tokenBodyFormat = creds.tokenBodyFormat;
  } else if (latest.provider === "google_ads") {
    clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    tokenUrl = "https://oauth2.googleapis.com/token";
    tokenBodyFormat = "form";
  }

  if (!clientId || !clientSecret) return latest;

  const refreshCipherBefore = latest.refresh_token_cipher;
  const refresh = await decryptSecret(refreshCipherBefore);

  let accessToken: string | undefined;
  let newRefresh: string | undefined;
  let expiresIn: number | undefined;

  if (
    latest.provider === "rdstation_crm" ||
    latest.provider === "rdstation_mkt"
  ) {
    const { ok, status, json } = await requestRdToken({
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
      console.error("[oauth] RD refresh failed", {
        connectionId: latest.id,
        provider: latest.provider,
        status,
        error: json?.error ?? json?.error_description ?? null,
      });
      return recoverOrMarkReauth(latest, refreshCipherBefore, "refresh_failed");
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
      error?: string;
    } | null;
    if (!res.ok || !json?.access_token) {
      console.error("[oauth] refresh failed", {
        connectionId: latest.id,
        provider: latest.provider,
        status: res.status,
        error: json?.error ?? null,
      });
      return recoverOrMarkReauth(latest, refreshCipherBefore, "refresh_failed");
    }
    accessToken = json.access_token;
    newRefresh = json.refresh_token;
    expiresIn = json.expires_in;
  }

  const accessCipher = await encryptSecret(accessToken);
  const refreshCipher = newRefresh
    ? await encryptSecret(newRefresh)
    : refreshCipherBefore;
  // RD usually returns expires_in (e.g. 86400). Default avoids refreshing on every call.
  const ttlSec =
    typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 86_400;
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

  // Conditional update: only win if nobody else rotated the refresh_token first.
  const meta = metadataRecord(latest.metadata);
  delete meta.needs_reauth;
  delete meta.reauth_reason;
  meta.last_refresh_at = new Date().toISOString();

  const updated = await queryOne<IntegrationConnectionRow>(
    `update integration_connections set
       access_token_cipher = $1,
       refresh_token_cipher = $2,
       expires_at = $3,
       metadata = $4::jsonb,
       updated_at = now()
     where id = $5
       and refresh_token_cipher is not distinct from $6
     returning *`,
    [
      accessCipher,
      refreshCipher,
      expiresAt,
      JSON.stringify(meta),
      latest.id,
      refreshCipherBefore,
    ]
  );

  if (updated) return updated;

  // Lost the race — return the winner's row (do not mark needs_reauth).
  const winner = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [latest.id]
  );
  return winner ?? latest;
}

async function recoverOrMarkReauth(
  conn: IntegrationConnectionRow,
  refreshCipherUsed: string,
  reason: string
): Promise<IntegrationConnectionRow> {
  const again = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [conn.id]
  );
  if (again) {
    if (tokenStillValid(again.expires_at)) {
      return (await healStickyReauthIfTokenValid(again)) ?? again;
    }
    // Winner rotated refresh_token; our INVALID_REFRESH_TOKEN is expected.
    if (
      again.refresh_token_cipher &&
      again.refresh_token_cipher !== refreshCipherUsed
    ) {
      return again;
    }
  }
  return markNeedsReauth(again ?? conn, reason);
}

async function markNeedsReauth(
  conn: IntegrationConnectionRow,
  reason: string
): Promise<IntegrationConnectionRow> {
  await ensureDbReady();
  // Merge onto fresh metadata so a concurrent success is not wiped.
  const fresh =
    (await queryOne<IntegrationConnectionRow>(
      `select * from integration_connections where id = $1`,
      [conn.id]
    )) ?? conn;

  if (tokenStillValid(fresh.expires_at)) {
    return (await healStickyReauthIfTokenValid(fresh)) ?? fresh;
  }

  const meta = metadataRecord(fresh.metadata);
  meta.needs_reauth = true;
  meta.reauth_reason = reason;
  meta.reauth_marked_at = new Date().toISOString();
  await query(
    `update integration_connections set
       metadata = $1::jsonb,
       updated_at = now()
     where id = $2`,
    [JSON.stringify(meta), fresh.id]
  );
  const updated = await queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1`,
    [fresh.id]
  );
  return (
    updated ?? {
      ...fresh,
      metadata: meta as IntegrationConnectionRow["metadata"],
    }
  );
}
