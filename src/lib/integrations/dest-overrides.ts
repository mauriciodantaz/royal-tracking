import type { IntegrationConnectionRow } from "@/lib/db/types";

export type DestNameOverrides = {
  meta?: string | null;
  ga4?: string | null;
};

export type NamedDestTarget = {
  dest: IntegrationConnectionRow;
  destEventName: string;
};

/** Fan-out explícito por nome (CRM / catálogo). Inclui Google Ads quando pedido. */
export function targetsFromNamedDests(
  dests: IntegrationConnectionRow[],
  names: DestNameOverrides,
  includeGoogleAds: boolean
): NamedDestTarget[] {
  const out: NamedDestTarget[] = [];
  const meta = names.meta?.trim() || null;
  const ga4 = names.ga4?.trim() || null;
  if (meta) {
    for (const dest of dests) {
      if (dest.provider === "meta_pixel" && dest.active) {
        out.push({ dest, destEventName: meta });
      }
    }
  }
  if (ga4) {
    for (const dest of dests) {
      if (dest.provider === "ga4" && dest.active) {
        out.push({ dest, destEventName: ga4 });
      }
    }
  }
  if (includeGoogleAds) {
    const adsName = meta || ga4;
    if (adsName) {
      for (const dest of dests) {
        if (dest.provider === "google_ads" && dest.active) {
          out.push({ dest, destEventName: adsName });
        }
      }
    }
  }
  return out;
}
