import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import type { IntegrationConnectionRow, Json } from "@/lib/db/types";
import { configString } from "@/lib/integrations/connections";

export const PIPEDRIVE_AUTHORIZE = "https://oauth.pipedrive.com/oauth/authorize";
export const PIPEDRIVE_TOKEN = "https://oauth.pipedrive.com/oauth/token";
export const PIPEDRIVE_REVOKE = "https://oauth.pipedrive.com/oauth/revoke";

export type PipedriveOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  source: "connection" | "env";
};

export type PipedriveTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  api_domain?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function envPair(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.PIPEDRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function resolvePipedriveCredentials(
  conn: IntegrationConnectionRow | null
): Promise<PipedriveOAuthCredentials | null> {
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
            authorizeUrl: PIPEDRIVE_AUTHORIZE,
            tokenUrl: PIPEDRIVE_TOKEN,
            source: "connection",
          };
        }
      } catch (err) {
        console.error(
          "[pipedrive] client_secret decrypt failed — falling back to env",
          { connectionId: conn.id, err }
        );
      }
    }
  }

  const fromEnv = envPair();
  if (!fromEnv) return null;
  return {
    ...fromEnv,
    authorizeUrl: PIPEDRIVE_AUTHORIZE,
    tokenUrl: PIPEDRIVE_TOKEN,
    source: "env",
  };
}

/** Pipedrive prefers HTTP Basic Auth with client_id:client_secret. */
export async function requestPipedriveToken(opts: {
  clientId: string;
  clientSecret: string;
  body: Record<string, string>;
}): Promise<{ ok: boolean; status: number; json: PipedriveTokenResponse | null }> {
  const basic = Buffer.from(
    `${opts.clientId}:${opts.clientSecret}`,
    "utf8"
  ).toString("base64");
  const res = await fetch(PIPEDRIVE_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams(opts.body).toString(),
  });
  const json = (await res.json().catch(() => null)) as PipedriveTokenResponse | null;
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

export function apiDomainFromMetadata(
  metadata: IntegrationConnectionRow["metadata"]
): string | null {
  const meta = metadataRecord(metadata);
  const domain =
    (typeof meta.api_domain === "string" && meta.api_domain) ||
    (typeof meta.company_domain === "string" && meta.company_domain) ||
    null;
  if (!domain) return null;
  const cleaned = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .trim();
  return cleaned || null;
}
