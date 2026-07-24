import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { auth } from "@/auth";
import { ensureDbReady } from "@/lib/db/boot";
import { getAppUrl } from "@/lib/env";
import { getConnection } from "@/lib/integrations/connections";
import {
  isIntegrationProvider,
  isUiVisibleProvider,
} from "@/lib/integrations/registry";
import { resolvePipedriveCredentials } from "@/lib/pipedrive/credentials";
import {
  oauthCallbackUrl,
  resolveRdCredentials,
} from "@/lib/rd/credentials";

export const runtime = "nodejs";

function googleOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
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
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  };
}

type Ctx = { params: Promise<{ provider: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", getAppUrl()));
  }

  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  if (!isUiVisibleProvider(provider)) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  await ensureDbReady();
  const connectionId =
    request.nextUrl.searchParams.get("connection_id")?.trim() || null;

  let clientId: string;
  let authorizeUrl: string;
  let authorizeQuery: Record<string, string> | undefined;

  if (provider === "rdstation_crm" || provider === "rdstation_mkt") {
    const conn = connectionId ? await getConnection(connectionId) : null;
    if (connectionId && (!conn || conn.provider !== provider)) {
      return NextResponse.json(
        { error: "connection_not_found" },
        { status: 404 }
      );
    }
    const creds = await resolveRdCredentials(conn, provider);
    if (!creds) {
      return NextResponse.json(
        {
          error: "oauth_not_configured",
          message:
            "Salve Client ID e Client Secret na conexão antes de autorizar.",
        },
        { status: 501 }
      );
    }
    clientId = creds.clientId;
    authorizeUrl = creds.authorizeUrl;
    authorizeQuery = creds.authorizeQuery;
  } else if (provider === "pipedrive") {
    const conn = connectionId ? await getConnection(connectionId) : null;
    if (connectionId && (!conn || conn.provider !== provider)) {
      return NextResponse.json(
        { error: "connection_not_found" },
        { status: 404 }
      );
    }
    const creds = await resolvePipedriveCredentials(conn);
    if (!creds) {
      return NextResponse.json(
        {
          error: "oauth_not_configured",
          message:
            "Salve Client ID e Client Secret na conexão antes de autorizar.",
        },
        { status: 501 }
      );
    }
    clientId = creds.clientId;
    authorizeUrl = creds.authorizeUrl;
  } else if (provider === "google_ads") {
    const env = googleOAuthEnv();
    if (!env) {
      return NextResponse.json(
        {
          error: "oauth_not_configured",
          message:
            "As chaves do aplicativo ainda não foram configuradas para esta plataforma.",
        },
        { status: 501 }
      );
    }
    clientId = env.clientId;
    authorizeUrl = env.authorizeUrl;
  } else {
    return NextResponse.json(
      { error: "oauth_not_supported" },
      { status: 400 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = oauthCallbackUrl(provider, getAppUrl());

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (authorizeQuery) {
    for (const [key, value] of Object.entries(authorizeQuery)) {
      url.searchParams.set(key, value);
    }
  }
  if (provider === "google_ads") {
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/adwords"
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  if (connectionId) {
    res.cookies.set(`oauth_conn_${provider}`, connectionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } else {
    res.cookies.delete(`oauth_conn_${provider}`);
  }
  return res;
}
