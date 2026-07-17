import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import type { IntegrationConnectionRow, Json } from "@/lib/db/types";
import { configString } from "@/lib/integrations/connections";

export type RdTokenBodyFormat = "json" | "form";

export type RdOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** CRM uses form-urlencoded; Marketing uses JSON (n8n: Authentication body). */
  tokenBodyFormat: RdTokenBodyFormat;
  /** Extra query params on authorize (CRM: scope=read write). */
  authorizeQuery?: Record<string, string>;
  source: "connection" | "env";
};

/**
 * Same split as n8n OAuth2 credentials:
 * - CRM: accounts.rdstation.com/oauth/authorize + api.rd.services/oauth2/token (form)
 * - MKT: api.rd.services/auth/dialog + api.rd.services/auth/token (JSON body)
 */
const MKT_AUTHORIZE = "https://api.rd.services/auth/dialog";
const MKT_TOKEN = "https://api.rd.services/auth/token";

const CRM_AUTHORIZE = "https://accounts.rdstation.com/oauth/authorize";
const CRM_TOKEN = "https://api.rd.services/oauth2/token";

function endpointsForProvider(provider: string): {
  authorizeUrl: string;
  tokenUrl: string;
  tokenBodyFormat: RdTokenBodyFormat;
  authorizeQuery?: Record<string, string>;
} {
  if (provider === "rdstation_crm") {
    return {
      authorizeUrl: CRM_AUTHORIZE,
      tokenUrl: CRM_TOKEN,
      tokenBodyFormat: "form",
      authorizeQuery: { scope: "read write" },
    };
  }
  return {
    authorizeUrl: MKT_AUTHORIZE,
    tokenUrl: MKT_TOKEN,
    tokenBodyFormat: "json",
  };
}

function envPair(
  provider: string
): { clientId: string; clientSecret: string } | null {
  if (provider === "rdstation_crm") {
    const clientId = process.env.RDSTATION_CRM_CLIENT_ID?.trim();
    const clientSecret = process.env.RDSTATION_CRM_CLIENT_SECRET?.trim();
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  if (provider === "rdstation_mkt") {
    const clientId = process.env.RDSTATION_MKT_CLIENT_ID?.trim();
    const clientSecret = process.env.RDSTATION_MKT_CLIENT_SECRET?.trim();
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  return null;
}

export async function resolveRdCredentials(
  conn: IntegrationConnectionRow | null,
  provider: string
): Promise<RdOAuthCredentials | null> {
  const endpoints = endpointsForProvider(provider);

  if (conn) {
    const clientId = configString(conn, "client_id")?.trim();
    const cipher = configString(conn, "client_secret_cipher");
    if (clientId && cipher) {
      try {
        const clientSecret = await decryptSecret(cipher);
        if (clientSecret) {
          return {
            clientId,
            clientSecret,
            ...endpoints,
            source: "connection",
          };
        }
      } catch {
        /* fall through to env */
      }
    }
  }

  const fromEnv = envPair(provider);
  if (!fromEnv) return null;
  return {
    ...fromEnv,
    ...endpoints,
    source: "env",
  };
}

export type RdTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Exchange authorization code or refresh token with the correct CRM/MKT format. */
export async function requestRdToken(opts: {
  tokenUrl: string;
  tokenBodyFormat: RdTokenBodyFormat;
  body: Record<string, string>;
}): Promise<{ ok: boolean; status: number; json: RdTokenResponse | null }> {
  const headers: Record<string, string> = {};
  let body: string;
  if (opts.tokenBodyFormat === "form") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.body).toString();
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers,
    body,
  });
  const json = (await res.json().catch(() => null)) as RdTokenResponse | null;
  return { ok: res.ok, status: res.status, json };
}

export function oauthCallbackUrl(provider: string, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/integrations/${provider}/oauth/callback`;
}

export function readConfigRecord(
  config: IntegrationConnectionRow["config"]
): Record<string, string> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    config as Record<string, Json | undefined>
  )) {
    if (v != null && v !== "") out[k] = String(v);
  }
  return out;
}

export function metadataRecord(
  metadata: IntegrationConnectionRow["metadata"]
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}
