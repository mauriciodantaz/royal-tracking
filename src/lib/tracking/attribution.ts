import type { VisitorRow } from "@/lib/db/types";

/** Attribution window from first lead entry (days). */
export const ATTRIBUTION_WINDOW_DAYS = 30;

export type ConversionAttribution = {
  source: "first_touch" | "last_touch";
  withinWindow: boolean;
  firstLeadAt: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  fbp: string | null;
  fbc: string | null;
  gclid: string | null;
  ttclid: string | null;
  ctwa_clid: string | null;
  wbraid: string | null;
  gbraid: string | null;
};

function ageDays(fromIso: string, now: Date): number {
  const ms = now.getTime() - new Date(fromIso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * At conversion time: use frozen first-touch if first_lead_at is within 30 days;
 * otherwise fall back to current (last-touch) visitor fields.
 */
export function resolveConversionAttribution(
  visitor: Pick<
    VisitorRow,
    | "first_lead_at"
    | "ft_utm_source"
    | "ft_utm_medium"
    | "ft_utm_campaign"
    | "ft_utm_term"
    | "ft_utm_content"
    | "ft_referrer"
    | "ft_fbp"
    | "ft_fbc"
    | "ft_gclid"
    | "ft_ttclid"
    | "ft_ctwa_clid"
    | "ft_wbraid"
    | "ft_gbraid"
    | "utm_source"
    | "utm_medium"
    | "utm_campaign"
    | "utm_term"
    | "utm_content"
    | "referrer"
    | "fbp"
    | "fbc"
    | "gclid"
    | "ttclid"
    | "ctwa_clid"
    | "wbraid"
    | "gbraid"
  > | null
  | undefined,
  now: Date = new Date()
): ConversionAttribution {
  const firstLeadAt = visitor?.first_lead_at ?? null;
  const withinWindow =
    Boolean(firstLeadAt) &&
    ageDays(firstLeadAt!, now) <= ATTRIBUTION_WINDOW_DAYS;

  if (withinWindow && visitor) {
    return {
      source: "first_touch",
      withinWindow: true,
      firstLeadAt,
      utm_source: visitor.ft_utm_source ?? visitor.utm_source,
      utm_medium: visitor.ft_utm_medium ?? visitor.utm_medium,
      utm_campaign: visitor.ft_utm_campaign ?? visitor.utm_campaign,
      utm_term: visitor.ft_utm_term ?? visitor.utm_term,
      utm_content: visitor.ft_utm_content ?? visitor.utm_content,
      referrer: visitor.ft_referrer ?? visitor.referrer,
      fbp: visitor.ft_fbp ?? visitor.fbp,
      fbc: visitor.ft_fbc ?? visitor.fbc,
      gclid: visitor.ft_gclid ?? visitor.gclid,
      ttclid: visitor.ft_ttclid ?? visitor.ttclid,
      ctwa_clid: visitor.ft_ctwa_clid ?? visitor.ctwa_clid,
      wbraid: visitor.ft_wbraid ?? visitor.wbraid,
      gbraid: visitor.ft_gbraid ?? visitor.gbraid,
    };
  }

  return {
    source: "last_touch",
    withinWindow: false,
    firstLeadAt,
    utm_source: visitor?.utm_source ?? null,
    utm_medium: visitor?.utm_medium ?? null,
    utm_campaign: visitor?.utm_campaign ?? null,
    utm_term: visitor?.utm_term ?? null,
    utm_content: visitor?.utm_content ?? null,
    referrer: visitor?.referrer ?? null,
    fbp: visitor?.fbp ?? null,
    fbc: visitor?.fbc ?? null,
    gclid: visitor?.gclid ?? null,
    ttclid: visitor?.ttclid ?? null,
    ctwa_clid: visitor?.ctwa_clid ?? null,
    wbraid: visitor?.wbraid ?? null,
    gbraid: visitor?.gbraid ?? null,
  };
}
