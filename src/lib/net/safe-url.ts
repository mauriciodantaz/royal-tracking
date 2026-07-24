import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;

export type SafeUrlResult =
  | { ok: true; href: string }
  | { ok: false; error: string };

function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    // IPv4-mapped :ffff:x.x.x.x
    const mapped = lower.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1]) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true;
}

/**
 * Validate user-configured outbound URLs (Evolution / UazAPI).
 * Requires https, blocks credentials in URL, localhost, and private/metadata IPs.
 */
export async function assertSafeOutboundUrl(
  raw: string,
  opts?: { allowHttpInDev?: boolean }
): Promise<SafeUrlResult> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Informe a URL." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL inválida." };
  }

  const allowHttp =
    opts?.allowHttpInDev === true && process.env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    return { ok: false, error: "A URL deve usar HTTPS." };
  }

  if (url.username || url.password) {
    return { ok: false, error: "URL não pode conter usuário/senha." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return { ok: false, error: "Host não permitido." };
  }

  const literalIp = isIP(host);
  if (literalIp && isPrivateOrReservedIp(host)) {
    return { ok: false, error: "IP privado ou reservado não é permitido." };
  }

  if (!literalIp) {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      if (records.length === 0) {
        return { ok: false, error: "Não foi possível resolver o host." };
      }
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          return { ok: false, error: "Host resolve para IP não permitido." };
        }
      }
    } catch {
      return { ok: false, error: "Não foi possível resolver o host." };
    }
  }

  return { ok: true, href: url.href.replace(/\/$/, "") };
}

export async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omit, ...rest } = init ?? {};
  void _omit;
  const signal =
    rest.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  return fetch(url, { ...rest, signal });
}
