import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import type { IntegrationConnectionRow, Json } from "@/lib/db/types";
import { configString } from "@/lib/integrations/connections";

export type RdOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  source: "connection" | "env";
};

const RD_AUTHORIZE = "https://api.rd.services/auth/dialog";
const RD_TOKEN = "https://api.rd.services/auth/token";

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
            authorizeUrl: RD_AUTHORIZE,
            tokenUrl: RD_TOKEN,
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
    authorizeUrl: RD_AUTHORIZE,
    tokenUrl: RD_TOKEN,
    source: "env",
  };
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
  for (const [k, v] of Object.entries(config as Record<string, Json | undefined>)) {
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
