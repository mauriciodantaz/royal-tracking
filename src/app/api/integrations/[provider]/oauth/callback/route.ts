import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { getAppUrl } from "@/lib/env";
import { seedDefaultMappingsForOutbound } from "@/lib/integrations/connections";
import { getModule, isIntegrationProvider } from "@/lib/integrations/registry";

export const runtime = "nodejs";

function oauthEnv(provider: string): {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
} | null {
  switch (provider) {
    case "rdstation_crm":
      if (
        !process.env.RDSTATION_CRM_CLIENT_ID ||
        !process.env.RDSTATION_CRM_CLIENT_SECRET
      ) {
        return null;
      }
      return {
        clientId: process.env.RDSTATION_CRM_CLIENT_ID,
        clientSecret: process.env.RDSTATION_CRM_CLIENT_SECRET,
        tokenUrl: "https://api.rd.services/auth/token",
      };
    case "rdstation_mkt":
      if (
        !process.env.RDSTATION_MKT_CLIENT_ID ||
        !process.env.RDSTATION_MKT_CLIENT_SECRET
      ) {
        return null;
      }
      return {
        clientId: process.env.RDSTATION_MKT_CLIENT_ID,
        clientSecret: process.env.RDSTATION_MKT_CLIENT_SECRET,
        tokenUrl: "https://api.rd.services/auth/token",
      };
    case "google_ads":
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
    default:
      return null;
  }
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
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_state", base)
    );
  }

  const env = oauthEnv(provider);
  if (!env) {
    return NextResponse.redirect(
      new URL("/dashboard/integracoes?error=oauth_not_configured", base)
    );
  }

  const redirectUri = `${base}/api/integrations/${provider}/oauth/callback`;
  const tokenRes = await fetch(env.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  } | null;

  if (!tokenRes.ok || !tokenJson?.access_token) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/integracoes?error=oauth_token&detail=${encodeURIComponent(tokenJson?.error ?? "fail")}`,
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
      JSON.stringify({ connected_via: "oauth", connected_at: new Date().toISOString() }),
    ]
  );

  const id = inserted.rows[0]?.id;
  if (id && (provider === "meta_pixel" || provider === "ga4" || provider === "google_ads")) {
    await seedDefaultMappingsForOutbound(id, provider);
  }

  const res = NextResponse.redirect(
    new URL("/dashboard/integracoes?connected=1", base)
  );
  res.cookies.delete(`oauth_state_${provider}`);
  return res;
}
