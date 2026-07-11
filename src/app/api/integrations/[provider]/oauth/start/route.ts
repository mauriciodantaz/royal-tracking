import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { auth } from "@/auth";
import { ensureDbReady } from "@/lib/db/boot";
import { getAppUrl } from "@/lib/env";
import { isIntegrationProvider } from "@/lib/integrations/registry";

export const runtime = "nodejs";

function oauthEnv(provider: string): { clientId: string; clientSecret: string; authorizeUrl: string; tokenUrl: string } | null {
  switch (provider) {
    case "rdstation_crm":
      if (!process.env.RDSTATION_CRM_CLIENT_ID || !process.env.RDSTATION_CRM_CLIENT_SECRET) {
        return null;
      }
      return {
        clientId: process.env.RDSTATION_CRM_CLIENT_ID,
        clientSecret: process.env.RDSTATION_CRM_CLIENT_SECRET,
        authorizeUrl: "https://api.rd.services/auth/dialog",
        tokenUrl: "https://api.rd.services/auth/token",
      };
    case "rdstation_mkt":
      if (!process.env.RDSTATION_MKT_CLIENT_ID || !process.env.RDSTATION_MKT_CLIENT_SECRET) {
        return null;
      }
      return {
        clientId: process.env.RDSTATION_MKT_CLIENT_ID,
        clientSecret: process.env.RDSTATION_MKT_CLIENT_SECRET,
        authorizeUrl: "https://api.rd.services/auth/dialog",
        tokenUrl: "https://api.rd.services/auth/token",
      };
    case "google_ads":
      if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
        return null;
      }
      return {
        clientId: process.env.GOOGLE_ADS_CLIENT_ID,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
      };
    default:
      return null;
  }
}

type Ctx = { params: Promise<{ provider: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", getAppUrl()));
  }

  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  const env = oauthEnv(provider);
  if (!env) {
    return NextResponse.json(
      {
        error: "oauth_not_configured",
        message: `Defina CLIENT_ID/SECRET no Portainer para ${provider}`,
      },
      { status: 501 }
    );
  }

  await ensureDbReady();
  const state = randomBytes(16).toString("hex");
  const redirectUri = `${getAppUrl().replace(/\/$/, "")}/api/integrations/${provider}/oauth/callback`;

  // Store state in cookie for CSRF
  const url = new URL(env.authorizeUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
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
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
