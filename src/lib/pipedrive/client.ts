import "server-only";

import { decryptAccessToken } from "@/lib/integrations/connections";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { refreshConnectionIfNeeded } from "@/lib/integrations/token-refresh";
import {
  apiDomainFromMetadata,
  metadataRecord,
} from "@/lib/pipedrive/credentials";

export class PipedriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipedriveAuthError";
  }
}

export async function getValidAccessToken(
  conn: IntegrationConnectionRow
): Promise<{ token: string; conn: IntegrationConnectionRow }> {
  const refreshed = await refreshConnectionIfNeeded(conn);
  const token = await decryptAccessToken(refreshed);
  if (!token) {
    throw new PipedriveAuthError(
      "Pipedrive sem access token — conecte com OAuth"
    );
  }

  const meta = metadataRecord(refreshed.metadata);
  if (meta.needs_reauth === true) {
    const exp = refreshed.expires_at
      ? new Date(refreshed.expires_at).getTime()
      : NaN;
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      throw new PipedriveAuthError(
        "Pipedrive precisa de reautorização OAuth"
      );
    }
  }

  return { token, conn: refreshed };
}

function apiBase(conn: IntegrationConnectionRow): string {
  const domain = apiDomainFromMetadata(conn.metadata);
  if (domain) {
    if (domain.includes("/api/")) {
      return `https://${domain.replace(/\/+$/, "")}`;
    }
    return `https://${domain}/api/v1`;
  }
  return "https://api.pipedrive.com/v1";
}

export async function pipedriveFetch(
  conn: IntegrationConnectionRow,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; json: unknown; conn: IntegrationConnectionRow }> {
  const { token, conn: fresh } = await getValidAccessToken(conn);
  const base = apiBase(fresh);
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => null);
  return { res, json, conn: fresh };
}

export function unwrapDataList(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.data)) {
    return o.data.filter(
      (x): x is Record<string, unknown> =>
        !!x && typeof x === "object" && !Array.isArray(x)
    );
  }
  return [];
}

export function unwrapDataObject(
  json: unknown
): Record<string, unknown> | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    return o.data as Record<string, unknown>;
  }
  return o;
}
