import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import { seedDefaultMappingsForOutbound } from "@/lib/integrations/connections";
import {
  getModule,
  isIntegrationProvider,
  isUiVisibleProvider,
} from "@/lib/integrations/registry";
import {
  metadataRecord as pdMetadataRecord,
  oauthCallbackUrl as pdOauthCallbackUrl,
  requestPipedriveToken,
  resolvePipedriveCredentials,
} from "@/lib/pipedrive/credentials";
import { postOauthPipedriveSetup } from "@/lib/pipedrive/sync";
import {
  metadataRecord,
  oauthCallbackUrl,
  requestRdToken,
  resolveRdCredentials,
  type RdTokenBodyFormat,
} from "@/lib/rd/credentials";
import { postOauthRdSetup } from "@/lib/rd/sync";

export const runtime = "nodejs";

function googleTokenEnv(): {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
} | null {
  if (
    !process.env.GOOGLE_ADS_CLIENT_ID ||
    !process.env.GOOGLE_ADS_CLIENT_SECRET
  ) {
    return null;
  }
  return {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    tokenUrl: "https://oauth2.googleapis.com/token",
  };
}

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Pipedrive uninstall: DELETE to callback with Basic Auth (client_id:client_secret)
 * and JSON body { client_id, company_id, user_id, timestamp }.
 */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { provider } = await context.params;
  if (provider !== "pipedrive") {
    return NextResponse.json({ error: "not_supported" }, { status: 405 });
  }

  await ensureDbReady();

  const authHeader = request.headers.get("authorization") || "";
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const companyId =
    body.company_id != null ? String(body.company_id) : null;
  const userId = body.user_id != null ? String(body.user_id) : null;

  const connections = await query<IntegrationConnectionRow>(
    `select * from integration_connections
     where provider = 'pipedrive' and active = true`
  );

  for (const conn of connections.rows) {
    const creds = await resolvePipedriveCredentials(conn);
    if (!creds) continue;

    const expected = Buffer.from(
      `${creds.clientId}:${creds.clientSecret}`,
      "utf8"
    ).toString("base64");
    const okAuth =
      authHeader === `Basic ${expected}` ||
      authHeader.toLowerCase() === `basic ${expected.toLowerCase()}`;
    if (!okAuth) continue;

    const meta = pdMetadataRecord(conn.metadata);
    const metaCompany =
      meta.company_id != null ? String(meta.company_id) : null;
    const metaUser = meta.user_id != null ? String(meta.user_id) : null;
    if (companyId && metaCompany && companyId !== metaCompany) continue;
    if (userId && metaUser && userId !== metaUser) continue;

    meta.uninstalled_at = new Date().toISOString();
    meta.needs_reauth = true;
    meta.reauth_reason = "pipedrive_uninstalled";
    await query(
      `update integration_connections set
         active = false,
         access_token_cipher = null,
         refresh_token_cipher = null,
         expires_at = null,
         metadata = $1::jsonb,
         updated_at = now()
       where id = $2`,
      [JSON.stringify(meta), conn.id]
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest, context: Ctx) {
  const session = await auth();
  const base = getAppUrl().replace(/\/$/, "");
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=invalid_provider", base)
    );
  }
  if (!isUiVisibleProvider(provider)) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const cookieState = request.cookies.get(`oauth_state_${provider}`)?.value;
  const connectionId =
    request.cookies.get(`oauth_conn_${provider}`)?.value?.trim() || null;

  if (oauthError === "user_denied") {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_denied", base)
    );
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_state", base)
    );
  }

  let clientId: string;
  let clientSecret: string;
  let tokenUrl: string;
  let tokenBodyFormat: RdTokenBodyFormat = "json";
  let usePipedriveBasic = false;

  if (provider === "rdstation_crm" || provider === "rdstation_mkt") {
    let conn: IntegrationConnectionRow | null = null;
    if (connectionId) {
      conn = await queryOne<IntegrationConnectionRow>(
        `select * from integration_connections where id = $1 limit 1`,
        [connectionId]
      );
    }
    const creds = await resolveRdCredentials(conn, provider);
    if (!creds) {
      return NextResponse.redirect(
        new URL("/dashboard/integracoes?error=oauth_not_configured", base)
      );
    }
    clientId = creds.clientId;
    clientSecret = creds.clientSecret;
    tokenUrl = creds.tokenUrl;
    tokenBodyFormat = creds.tokenBodyFormat;
  } else if (provider === "pipedrive") {
    let conn: IntegrationConnectionRow | null = null;
    if (connectionId) {
      conn = await queryOne<IntegrationConnectionRow>(
        `select * from integration_connections where id = $1 limit 1`,
        [connectionId]
      );
    }
    const creds = await resolvePipedriveCredentials(conn);
    if (!creds) {
      return NextResponse.redirect(
        new URL("/dashboard/integracoes?error=oauth_not_configured", base)
      );
    }
    clientId = creds.clientId;
    clientSecret = creds.clientSecret;
    tokenUrl = creds.tokenUrl;
    tokenBodyFormat = "form";
    usePipedriveBasic = true;
  } else if (provider === "google_ads") {
    const env = googleTokenEnv();
    if (!env) {
      return NextResponse.redirect(
        new URL("/dashboard/integracoes?error=oauth_not_configured", base)
      );
    }
    clientId = env.clientId;
    clientSecret = env.clientSecret;
    tokenUrl = env.tokenUrl;
    tokenBodyFormat = "form";
  } else {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_not_supported", base)
    );
  }

  const redirectUri =
    provider === "pipedrive"
      ? pdOauthCallbackUrl(provider, base)
      : oauthCallbackUrl(provider, base);

  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;
  let apiDomain: string | undefined;
  let tokenError: string | undefined;

  if (usePipedriveBasic) {
    const tokenExchange = await requestPipedriveToken({
      clientId,
      clientSecret,
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
    });
    if (!tokenExchange.ok || !tokenExchange.json?.access_token) {
      tokenError =
        tokenExchange.json?.error_description ||
        tokenExchange.json?.error ||
        `http_${tokenExchange.status}`;
    } else {
      accessToken = tokenExchange.json.access_token;
      refreshToken = tokenExchange.json.refresh_token;
      expiresIn = tokenExchange.json.expires_in;
      if (
        typeof tokenExchange.json.api_domain === "string" &&
        tokenExchange.json.api_domain
      ) {
        apiDomain = tokenExchange.json.api_domain
          .replace(/^https?:\/\//i, "")
          .replace(/\/+$/, "");
      }
    }
  } else {
    const tokenExchange = await requestRdToken({
      tokenUrl,
      tokenBodyFormat,
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
    });
    const tokenJson = tokenExchange.json;
    if (!tokenExchange.ok || !tokenJson?.access_token) {
      tokenError =
        tokenJson?.error_description ||
        tokenJson?.error ||
        `http_${tokenExchange.status}`;
    } else {
      accessToken = tokenJson.access_token;
      refreshToken = tokenJson.refresh_token;
      expiresIn = tokenJson.expires_in;
    }
  }

  if (!accessToken) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/integracoes?error=oauth_token&detail=${encodeURIComponent(tokenError || "unknown")}`,
        base
      )
    );
  }

  await ensureDbReady();
  const mod = getModule(provider)!;
  const accessCipher = await encryptSecret(accessToken);
  const refreshCipher = refreshToken
    ? await encryptSecret(refreshToken)
    : null;
  const ttlDefault =
    provider === "pipedrive"
      ? 3_600
      : provider === "rdstation_crm" || provider === "rdstation_mkt"
        ? 86_400
        : null;
  const ttlSec =
    typeof expiresIn === "number" && expiresIn > 0
      ? expiresIn
      : ttlDefault;
  const expiresAt = ttlSec
    ? new Date(Date.now() + ttlSec * 1000).toISOString()
    : null;

  let id = connectionId;

  if (id) {
    const existing = await queryOne<IntegrationConnectionRow>(
      `select * from integration_connections where id = $1 limit 1`,
      [id]
    );
    if (!existing || existing.provider !== provider) {
      return NextResponse.redirect(
        new URL("/dashboard/integracoes?error=oauth_connection", base)
      );
    }
    const meta = metadataRecord(existing.metadata);
    delete meta.needs_reauth;
    delete meta.reauth_reason;
    delete meta.uninstalled_at;
    meta.connected_via = "oauth";
    meta.connected_at = new Date().toISOString();
    if (apiDomain) meta.api_domain = apiDomain;

    await query(
      `update integration_connections set
         access_token_cipher = $1,
         refresh_token_cipher = coalesce($2, refresh_token_cipher),
         expires_at = $3,
         auth_type = 'oauth',
         active = true,
         metadata = $4::jsonb,
         updated_at = now()
       where id = $5`,
      [
        accessCipher,
        refreshCipher,
        expiresAt,
        JSON.stringify(meta),
        id,
      ]
    );
  } else {
    const inserted = await query<{ id: string }>(
      `insert into integration_connections (
         provider, label, auth_type, direction,
         access_token_cipher, refresh_token_cipher, expires_at, active, metadata
       ) values ($1,$2,'oauth',$3,$4,$5,$6,true,$7::jsonb)
       returning id`,
      [
        provider,
        `${mod.name} (OAuth)`,
        mod.direction,
        accessCipher,
        refreshCipher,
        expiresAt,
        JSON.stringify({
          connected_via: "oauth",
          connected_at: new Date().toISOString(),
          ...(apiDomain ? { api_domain: apiDomain } : {}),
        }),
      ]
    );
    id = inserted.rows[0]?.id ?? null;
  }

  if (id && provider === "google_ads") {
    await seedDefaultMappingsForOutbound(id, provider);
  }

  if (id && (provider === "rdstation_crm" || provider === "rdstation_mkt")) {
    try {
      await postOauthRdSetup(id);
    } catch (err) {
      console.error("[rd] postOauthRdSetup", err);
    }
  }

  if (id && provider === "pipedrive") {
    try {
      await postOauthPipedriveSetup(id);
    } catch (err) {
      console.error("[pipedrive] postOauthPipedriveSetup", err);
    }
  }

  const res = NextResponse.redirect(
    new URL(
      id
        ? `/dashboard/integracoes/${provider}?connected=1`
        : "/dashboard/integracoes?connected=1",
      base
    )
  );
  res.cookies.delete(`oauth_state_${provider}`);
  res.cookies.delete(`oauth_conn_${provider}`);
  return res;
}
