/**
 * Allowlist de origens para APIs públicas do snippet.
 *
 * Uma stack = um (ou poucos) domínio(s) apex de marca.
 * Ex.: ALLOWED_EVENT_DOMAINS=royalgrowth.com.br
 * aceita royalgrowth.com.br, www., lp., mkt., etc.
 *
 * Vazio / ausente = não filtra (dev / legado). Em produção, defina o apex.
 */

export function getAllowedEventDomains(): string[] {
  const raw = process.env.ALLOWED_EVENT_DOMAINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

export function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase().replace(/\.$/, "");
  const withoutPort = trimmed.split(":")[0] ?? "";
  return withoutPort;
}

/** Exact apex or any subdomain (rejects host that merely contains the apex). */
export function hostMatchesApex(host: string, apex: string): boolean {
  const h = normalizeHostname(host);
  const a = normalizeHostname(apex);
  if (!h || !a) return false;
  return h === a || h.endsWith(`.${a}`);
}

export function hostMatchesAnyApex(host: string, apexes: string[]): boolean {
  return apexes.some((apex) => hostMatchesApex(host, apex));
}

export function hostnameFromUrl(value: string): string | null {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
}

/** Prefer Origin; fall back to Referer (some browsers omit Origin on navigations). */
export function getRequestClientHostname(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    const host = hostnameFromUrl(origin);
    if (host) return host;
  }
  const referer = request.headers.get("referer");
  if (referer) return hostnameFromUrl(referer);
  return null;
}

export function isRequestOriginAllowed(request: Request): boolean {
  const apexes = getAllowedEventDomains();
  if (apexes.length === 0) return true;
  const host = getRequestClientHostname(request);
  if (!host) return false;
  return hostMatchesAnyApex(host, apexes);
}

/** Echoable Origin value when allowlisted; "*" when open; null when denied / unknown. */
export function resolveCorsAllowOrigin(request?: Request): string | null {
  const apexes = getAllowedEventDomains();
  if (apexes.length === 0) return "*";
  if (!request) return null;

  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return null;

  const originHost = hostnameFromUrl(origin);
  if (!originHost || !hostMatchesAnyApex(originHost, apexes)) return null;
  return origin;
}
