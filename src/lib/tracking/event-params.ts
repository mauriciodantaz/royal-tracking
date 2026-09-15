import type { MetaCustomData } from "@/lib/meta/capi";

export type EventParamValue = string | number | boolean;

const GA4_RESERVED_PREFIXES = ["google_", "ga_", "firebase_"];
const GA4_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

export const RESERVED_EVENT_SLUGS = new Set([
  "pageview",
  "lead",
  "purchase",
  "completeregistration",
  "initiatecheckout",
  "addtocart",
  "viewcontent",
  "addpaymentinfo",
  "contact",
  "subscribe",
  "generate_lead",
  "page_view",
  "begin_checkout",
  "add_payment_info",
  "sign_up",
  "add_to_cart",
  "view_item",
]);

export function normalizeEventSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isReservedEventSlug(slug: string): boolean {
  const n = normalizeEventSlug(slug);
  return RESERVED_EVENT_SLUGS.has(n) || RESERVED_EVENT_SLUGS.has(n.replace(/_/g, ""));
}

export function isValidCustomEventSlug(slug: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/.test(slug) && !isReservedEventSlug(slug);
}

export function isGa4ParamNameAllowed(name: string): boolean {
  if (!GA4_NAME_RE.test(name)) return false;
  const lower = name.toLowerCase();
  return !GA4_RESERVED_PREFIXES.some((p) => lower.startsWith(p));
}

export function sanitizeEventParams(
  raw: Record<string, unknown> | null | undefined
): Record<string, EventParamValue> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, EventParamValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 64) continue;
    if (typeof value === "string") {
      if (value.length > 500) continue;
      out[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function sanitizeGa4ExtraParams(
  params: Record<string, EventParamValue>
): Record<string, EventParamValue> {
  const out: Record<string, EventParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isGa4ParamNameAllowed(key)) out[key] = value;
  }
  return out;
}

export type CatalogParamPolicy = {
  include_value: boolean;
  include_items: boolean;
  default_currency: string | null;
  default_params: Record<string, EventParamValue>;
};

export function mergeEventCustomData(opts: {
  base?: MetaCustomData;
  extraParams?: Record<string, EventParamValue>;
  catalog?: CatalogParamPolicy | null;
}): MetaCustomData | undefined {
  const base = opts.base ?? {};
  const catalog = opts.catalog ?? null;
  const properties = {
    ...(catalog?.default_params ?? {}),
    ...(opts.extraParams ?? {}),
    ...(base.properties ?? {}),
  };
  const includeValue = catalog ? catalog.include_value : true;
  const includeItems = catalog ? catalog.include_items : true;
  const value = includeValue ? base.value : undefined;
  const currency = includeValue
    ? base.currency || catalog?.default_currency || undefined
    : undefined;
  const items = includeItems ? base.items : undefined;
  const content_ids = includeItems ? base.content_ids : undefined;
  const content_name = includeItems ? base.content_name : undefined;
  const content_type = includeItems ? base.content_type : undefined;

  const hasKnown =
    value != null ||
    Boolean(currency) ||
    (content_ids && content_ids.length > 0) ||
    Boolean(content_name) ||
    Boolean(content_type) ||
    (items && items.length > 0) ||
    Object.keys(properties).length > 0;

  if (!hasKnown) return undefined;
  return {
    value,
    currency,
    content_ids,
    content_name,
    content_type,
    items,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
  };
}

export type ResolutionPath = "catalog" | "overrides" | "mappings";

export function chooseResolutionPath(opts: {
  catalogMatched: boolean;
  hasOverrides: boolean;
}): ResolutionPath {
  if (opts.catalogMatched) return "catalog";
  if (opts.hasOverrides) return "overrides";
  return "mappings";
}
