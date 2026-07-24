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

export function fingerprintForm(input: {
  action?: string | null;
  label?: string | null;
  fieldNames: string[];
  pageUrl?: string | null;
}): string {
  const raw = [
    formPathKey(input.action, input.pageUrl),
    input.label ?? "",
    input.fieldNames.slice().sort().join(","),
    formPathKey(input.pageUrl),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
