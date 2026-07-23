import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ATTRIBUTION_WINDOW_DAYS,
  resolveConversionAttribution,
} from "./attribution";

function visitor(partial: Record<string, string | null>) {
  return {
    first_lead_at: null,
    ft_utm_source: null,
    ft_utm_medium: null,
    ft_utm_campaign: null,
    ft_utm_term: null,
    ft_utm_content: null,
    ft_referrer: null,
    ft_fbp: null,
    ft_fbc: null,
    ft_gclid: null,
    ft_ttclid: null,
    ft_ctwa_clid: null,
    ft_wbraid: null,
    ft_gbraid: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    referrer: null,
    fbp: null,
    fbc: null,
    gclid: null,
    ttclid: null,
    ctwa_clid: null,
    wbraid: null,
    gbraid: null,
    ...partial,
  };
}

describe("resolveConversionAttribution", () => {
  it("uses first-touch inside the 30-day window", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const first = new Date(now);
    first.setDate(first.getDate() - 10);
    const attr = resolveConversionAttribution(
      visitor({
        first_lead_at: first.toISOString(),
        ft_gclid: "gclid_first",
        ft_utm_source: "google",
        gclid: "gclid_last",
        utm_source: "facebook",
      }),
      now
    );
    assert.equal(attr.source, "first_touch");
    assert.equal(attr.withinWindow, true);
    assert.equal(attr.gclid, "gclid_first");
    assert.equal(attr.utm_source, "google");
    assert.equal(ATTRIBUTION_WINDOW_DAYS, 30);
  });

  it("falls back to last-touch outside the window", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const first = new Date(now);
    first.setDate(first.getDate() - 45);
    const attr = resolveConversionAttribution(
      visitor({
        first_lead_at: first.toISOString(),
        ft_gclid: "gclid_first",
        gclid: "gclid_last",
        utm_source: "facebook",
      }),
      now
    );
    assert.equal(attr.source, "last_touch");
    assert.equal(attr.withinWindow, false);
    assert.equal(attr.gclid, "gclid_last");
    assert.equal(attr.utm_source, "facebook");
  });

  it("uses last-touch when first_lead_at is missing", () => {
    const attr = resolveConversionAttribution(
      visitor({
        gclid: "gclid_only",
        utm_source: "direct",
      })
    );
    assert.equal(attr.source, "last_touch");
    assert.equal(attr.gclid, "gclid_only");
  });
});
