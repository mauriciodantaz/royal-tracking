import { createHash } from "node:crypto";

/**
 * Path-only key for form identity. Query/hash must not create separate forms
 * (e.g. WordPress action = current URI with ?cupom=…).
 */
export function formPathKey(
  href?: string | null,
  base?: string | null
): string {
  if (!href || typeof href !== "string") return "";
  const trimmed = href.trim();
  if (!trimmed || trimmed === "#" || trimmed === ".") return "";

  try {
    const u = base ? new URL(trimmed, base) : new URL(trimmed);
    return u.pathname || "/";
  } catch {
    return trimmed.split("?")[0]?.split("#")[0] ?? "";
  }
}

/** Sample URL stored on `forms.page_url` — origin + path, no query/hash. */
export function formSamplePageUrl(pageUrl?: string | null): string | null {
  if (!pageUrl || typeof pageUrl !== "string") return null;
  try {
    const u = new URL(pageUrl);
    return `${u.origin}${u.pathname || "/"}`;
  } catch {
    const stripped = pageUrl.split("?")[0]?.split("#")[0]?.trim();
    return stripped || null;
  }
}

/**
 * Normalize form labels that look like paths/URLs (Tray often uses action as name).
 * Strips query/hash so `?loja=` does not split forms.
 */
export function normalizeFormLabel(label?: string | null): string {
  if (!label || typeof label !== "string") return "";
  const trimmed = label.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("/") ||
    /^https?:\/\//i.test(trimmed) ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    const asPath = formPathKey(trimmed);
    if (asPath) return asPath;
  }
  return trimmed;
}

/**
 * Action path used in fingerprint. Empty when action is missing or points at
 * the same page as `pageUrl` (common on product add-to-cart forms).
 */
export function effectiveFormAction(
  action?: string | null,
  pageUrl?: string | null
): string {
  const actionPath = formPathKey(action, pageUrl);
  if (!actionPath) return "";
  const pagePath = formPathKey(pageUrl);
  if (pagePath && actionPath === pagePath) return "";
  return actionPath;
}

/**
 * Form identity: effectiveAction | normalizedLabel | sortedFields.
 * Page URL is intentionally excluded so the same ecommerce form on N product
 * pages collapses to one card.
 */
export function fingerprintForm(input: {
  action?: string | null;
  label?: string | null;
  fieldNames: string[];
  pageUrl?: string | null;
}): string {
  const raw = [
    effectiveFormAction(input.action, input.pageUrl),
    normalizeFormLabel(input.label),
    input.fieldNames.slice().sort().join(","),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** Legacy merge key when `form_action` was never stored on `forms`. */
export function formMergeIdentity(input: {
  label?: string | null;
  fieldNames: string[] | unknown;
}): string {
  const names = Array.isArray(input.fieldNames)
    ? input.fieldNames.map(String)
    : [];
  return [
    normalizeFormLabel(input.label),
    names.slice().sort().join(","),
  ].join("|");
}
