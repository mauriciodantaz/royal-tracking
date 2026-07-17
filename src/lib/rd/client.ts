import "server-only";

import {
  decryptAccessToken,
  getConnection,
} from "@/lib/integrations/connections";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { refreshConnectionIfNeeded } from "@/lib/integrations/token-refresh";
import { metadataRecord } from "@/lib/rd/credentials";

const CRM_BASE = "https://api.rd.services/crm/v2";
const MKT_BASE = "https://api.rd.services";

export class RdAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RdAuthError";
  }
}

export async function getValidAccessToken(
  conn: IntegrationConnectionRow
): Promise<{ token: string; conn: IntegrationConnectionRow }> {
  const refreshed = await refreshConnectionIfNeeded(conn);
  const meta = metadataRecord(refreshed.metadata);
  if (meta.needs_reauth === true) {
    throw new RdAuthError("RD Station precisa de reautorização OAuth");
  }
  const token = await decryptAccessToken(refreshed);
  if (!token) {
    throw new RdAuthError("RD Station sem access token — conecte com OAuth");
  }
  return { token, conn: refreshed };
}

export async function rdCrmFetch(
  conn: IntegrationConnectionRow,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; json: unknown; conn: IntegrationConnectionRow }> {
  const { token, conn: fresh } = await getValidAccessToken(conn);
  const url = path.startsWith("http")
    ? path
    : `${CRM_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => null);
  return { res, json, conn: fresh };
}

export async function rdMktFetch(
  conn: IntegrationConnectionRow,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; json: unknown; conn: IntegrationConnectionRow }> {
  const { token, conn: fresh } = await getValidAccessToken(conn);
  const url = path.startsWith("http")
    ? path
    : `${MKT_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => null);
  return { res, json, conn: fresh };
}

export async function reloadConnection(
  id: string
): Promise<IntegrationConnectionRow | null> {
  return getConnection(id);
}

export function unwrapDataList(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) {
    return json.filter(
      (x): x is Record<string, unknown> =>
        !!x && typeof x === "object" && !Array.isArray(x)
    );
  }
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.data)) {
    return o.data.filter(
      (x): x is Record<string, unknown> =>
        !!x && typeof x === "object" && !Array.isArray(x)
    );
  }
  if (
    o.data &&
    typeof o.data === "object" &&
    !Array.isArray(o.data) &&
    Array.isArray((o.data as { items?: unknown }).items)
  ) {
    return ((o.data as { items: unknown[] }).items).filter(
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
