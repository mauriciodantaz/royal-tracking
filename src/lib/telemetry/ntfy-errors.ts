import "server-only";

import { getAppUrl, getProjectName } from "@/lib/env";
import { getAppVersion, getReleaseChannel } from "@/lib/version/channel";

const NTFY_URL = "https://ntfy.royalserver.com.br/tracking-error";
const BODY_MAX = 1500;

const SECRET_KEY_RE =
  /^(access_token|api_secret|token|password|secret|authorization|client_secret|refresh_token|developer_token|capi_token)$/i;

function errorReportsEnabled(): boolean {
  const raw = process.env.ERROR_REPORTS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

function maskEmailLike(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

function maskPhoneLike(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return `***${digits.slice(-4)}`;
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return maskEmailLike(value);
    if (
      key.toLowerCase().includes("phone") ||
      key.toLowerCase() === "ph" ||
      key.toLowerCase() === "tel" ||
      (/^\+?\d[\d\s().-]{7,}$/.test(value) && value.replace(/\D/g, "").length >= 8)
    ) {
      return maskPhoneLike(value);
    }
  }
  return value;
}

function sanitizeForReport(input: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeForReport(item, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = redactValue(key, sanitizeForReport(value, depth + 1));
    }
    return out;
  }
  return input;
}

function truncateJson(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(sanitizeForReport(value), null, 2);
  } catch {
    text = String(value);
  }
  if (text.length <= BODY_MAX) return text;
  return `${text.slice(0, BODY_MAX)}\n…[truncated ${text.length - BODY_MAX} chars]`;
}

function instanceHost(): string {
  try {
    return new URL(getAppUrl()).host;
  } catch {
    return getAppUrl();
  }
}

export type IntegrationErrorReport = {
  provider: string;
  connectionId: string;
  error: string;
  status?: number;
  payload?: unknown;
  response?: unknown;
  eventId?: string;
  eventName?: string;
};

export function buildIntegrationErrorMessage(
  opts: IntegrationErrorReport
): { title: string; body: string; tags: string } {
  const project = getProjectName() || instanceHost();
  const title = `[Royal Tracking] ${opts.provider} falhou — ${project}`;
  const lines = [
    "=== Instância ===",
    `PROJECT_NAME: ${getProjectName() || "(vazio)"}`,
    `URL: ${getAppUrl()}`,
    `APP_VERSION: ${getAppVersion()}`,
    `RELEASE_CHANNEL: ${getReleaseChannel()}`,
    "",
    "=== Integração ===",
    `provider: ${opts.provider}`,
    `connectionId: ${opts.connectionId}`,
    `error: ${opts.error}`,
    "",
    "=== HTTP ===",
    `status: ${opts.status ?? "(n/a)"}`,
    "response:",
    truncateJson(opts.response ?? null),
    "",
    "=== Request ===",
    "payload:",
    truncateJson(opts.payload ?? null),
    "",
    "=== Contexto ===",
    `eventId: ${opts.eventId ?? "(n/a)"}`,
    `eventName: ${opts.eventName ?? "(n/a)"}`,
  ];
  return {
    title,
    body: lines.join("\n"),
    tags: `warning,royal-tracking,${opts.provider}`,
  };
}

/**
 * Phone-home de falha de integração via ntfy (oculto).
 * Never throws — logs only. Caller handles cooldown.
 */
export async function postIntegrationErrorToNtfy(
  opts: IntegrationErrorReport
): Promise<boolean> {
  if (!errorReportsEnabled()) return false;

  const { title, body, tags } = buildIntegrationErrorMessage(opts);
  const res = await fetch(NTFY_URL, {
    method: "POST",
    headers: {
      Title: title,
      Priority: "high",
      Tags: tags,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`ntfy HTTP ${res.status}`);
  }
  return true;
}
