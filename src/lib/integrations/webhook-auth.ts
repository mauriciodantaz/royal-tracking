import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import { decryptWebhookSecret } from "@/lib/integrations/connections";
import { PIPEDRIVE_WEBHOOK_AUTH_USER } from "@/lib/pipedrive/sync";

const MAX_WEBHOOK_BODY_BYTES = 1_048_576; // 1 MiB

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function extractWebhookToken(
  request: NextRequest,
  body?: unknown
): string | null {
  const header = request.headers.get("x-webhook-token");
  if (header) return header.trim();

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken) return queryToken.trim();

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    for (const key of ["hottok", "token", "webhook_token", "secret"]) {
      const v = rec[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

async function assertPipedriveBasicAuth(
  request: NextRequest,
  conn: IntegrationConnectionRow
): Promise<boolean> {
  const secret = await decryptWebhookSecret(conn);
  if (!secret) return false;

  const header = request.headers.get("authorization") || "";
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m?.[1]) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);
  return user === PIPEDRIVE_WEBHOOK_AUTH_USER && pass === secret;
}

/**
 * Authorize inbound webhook for a connection.
 * - pipedrive: HTTP Basic
 * - rdstation_conversas: short slug is the credential (Tallos cannot send custom headers)
 * - others: require stored webhook secret + matching token (header/query/body)
 */
export async function authorizeInboundWebhook(
  request: NextRequest,
  conn: IntegrationConnectionRow,
  body?: unknown
): Promise<boolean> {
  if (!conn.active) return false;

  if (conn.provider === "snippet") return false;

  if (conn.provider === "pipedrive") {
    return assertPipedriveBasicAuth(request, conn);
  }

  // Tallos posts to the short URL only; URL secrecy is the auth factor.
  if (conn.provider === "rdstation_conversas") {
    return true;
  }

  const secret = await decryptWebhookSecret(conn);
  const provided = extractWebhookToken(request, body);

  // RD Marketing may not send custom headers on older webhooks; short slug is
  // the credential. Prefer validating ?token= when present (new registrations).
  if (conn.provider === "rdstation_mkt") {
    if (provided && secret) return tokensEqual(secret, provided);
    if (!provided) return true;
    return false;
  }

  if (!secret || !provided) return false;
  return tokensEqual(secret, provided);
}

export async function readWebhookJson(
  request: NextRequest
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; error: "payload_too_large" | "invalid_json" }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, error: "payload_too_large" };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (Buffer.byteLength(text, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, error: "payload_too_large" };
  }

  try {
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}
