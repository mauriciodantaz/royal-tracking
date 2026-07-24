/**
 * Canonical page URL for analytics keys (strip tracking params, normalize host/slash).
 * event_source_url for CAPI stays raw; use canonical_url for dedup/reports.
 */

const DEFAULT_STRIP_EXACT = new Set([
  "gclid",
  "fbclid",
  "ttclid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "vero_id",
  "ref",
  "source",
  "campaign",
  "wbraid",
  "gbraid",
  "gclsrc",
  "dclid",
  "li_fat_id",
  "twclid",
  "srsltid",
]);

export type CanonicalUrlOptions = {
  /** Query keys to keep even if they look like tracking (e.g. categoria, page). */
  preserveParams?: string[];
  /** Force https scheme. Default false (keep original scheme). */
  forceHttps?: boolean;
};

function shouldStripParam(key: string, preserve: Set<string>): boolean {
  const k = key.toLowerCase();
  if (preserve.has(k)) return false;
  if (k.startsWith("utm_")) return true;
  if (DEFAULT_STRIP_EXACT.has(k)) return true;
  return false;
}

export function canonicalUrl(
  href: string | null | undefined,
  opts: CanonicalUrlOptions = {}
): string | null {
  if (!href || typeof href !== "string") return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (opts.forceHttps) {
    url.protocol = "https:";
  }

  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  const preserve = new Set(
    (opts.preserveParams || []).map((p) => p.toLowerCase())
  );
  const pairs: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (!shouldStripParam(key, preserve)) {
      pairs.push([key, value]);
    }
  });
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  url.search = "";
  for (const [k, v] of pairs) {
    url.searchParams.append(k, v);
  }

  // Drop hash for page key (SPA hash routes handled separately by caller if needed)
  url.hash = "";

  let path = url.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  url.pathname = path;

  return url.toString();
}

export function pageKeyFromUrl(
  href: string | null | undefined,
  opts?: CanonicalUrlOptions
): string | null {
  const c = canonicalUrl(href, opts);
  if (!c) return null;
  try {
    const u = new URL(c);
    return `${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return c;
  }
}
