import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import { seedDefaultMappingsForOutbound } from "@/lib/integrations/connections";
import { getModule, isIntegrationProvider } from "@/lib/integrations/registry";
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

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(`oauth_state_${provider}`)?.value;
  const connectionId =
    request.cookies.get(`oauth_conn_${provider}`)?.value?.trim() || null;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_state", base)
    );
  }

  let clientId: string;
  let clientSecret: string;
  let tokenUrl: string;
  let tokenBodyFormat: RdTokenBodyFormat = "json";

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

  const redirectUri = oauthCallbackUrl(provider, base);
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
    const detail =
      tokenJson?.error_description ||
      tokenJson?.error ||
      `http_${tokenExchange.status}`;
    return NextResponse.redirect(
      new URL(
        `/dashboard/integracoes?error=oauth_token&detail=${encodeURIComponent(detail)}`,
        base
      )
    );
  }

  await ensureDbReady();
  const mod = getModule(provider)!;
  const accessCipher = await encryptSecret(tokenJson.access_token);
  const refreshCipher = tokenJson.refresh_token
    ? await encryptSecret(tokenJson.refresh_token)
    : null;
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
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
    meta.connected_via = "oauth";
    meta.connected_at = new Date().toISOString();

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
