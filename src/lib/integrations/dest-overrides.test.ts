import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IntegrationConnectionRow } from "@/lib/db/types";

import { targetsFromNamedDests } from "./dest-overrides";

function dest(
  id: string,
  provider: string,
  active = true
): IntegrationConnectionRow {
  return {
    id,
    provider,
    label: provider,
    auth_type: "token",
    direction: "outbound",
    access_token_cipher: null,
    refresh_token_cipher: null,
    expires_at: null,
    webhook_secret_cipher: null,
    account_external_id: null,
    config: {},
    active,
    metadata: {},
    created_at: "",
    updated_at: "",
  };
}

describe("targetsFromNamedDests", () => {
  it("fans out Meta, GA4 and Google Ads when asked", () => {
    const dests = [
      dest("m1", "meta_pixel"),
      dest("g1", "ga4"),
      dest("a1", "google_ads"),
      dest("off", "meta_pixel", false),
    ];
    const targets = targetsFromNamedDests(
      dests,
      { meta: "Lead", ga4: "generate_lead" },
      true
    );
    assert.deepEqual(
      targets.map((t) => [t.dest.id, t.destEventName]),
      [
        ["m1", "Lead"],
        ["g1", "generate_lead"],
        ["a1", "Lead"],
      ]
    );
  });

  it("omits Ads unless includeGoogleAds is true", () => {
    const dests = [dest("m1", "meta_pixel"), dest("a1", "google_ads")];
    const targets = targetsFromNamedDests(dests, { meta: "Purchase" }, false);
    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.dest.id, "m1");
  });
});
