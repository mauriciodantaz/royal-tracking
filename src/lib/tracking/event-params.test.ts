import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chooseResolutionPath,
  isValidCustomEventSlug,
  mergeEventCustomData,
  sanitizeGa4ExtraParams,
} from "./event-params";

describe("custom event slugs", () => {
  it("accepts client slugs and rejects native names", () => {
    assert.equal(isValidCustomEventSlug("orcamento_aprovado"), true);
    assert.equal(isValidCustomEventSlug("Lead"), false);
    assert.equal(isValidCustomEventSlug("lead"), false);
    assert.equal(isValidCustomEventSlug("purchase"), false);
    assert.equal(isValidCustomEventSlug("generate_lead"), false);
    assert.equal(isValidCustomEventSlug("1invalido"), false);
  });
});

describe("chooseResolutionPath", () => {
  it("prefers catalog, then overrides, then mappings", () => {
    assert.equal(
      chooseResolutionPath({ catalogMatched: true, hasOverrides: true }),
      "catalog"
    );
    assert.equal(
      chooseResolutionPath({ catalogMatched: false, hasOverrides: true }),
      "overrides"
    );
    assert.equal(
      chooseResolutionPath({ catalogMatched: false, hasOverrides: false }),
      "mappings"
    );
  });
});

describe("mergeEventCustomData", () => {
  it("merges catalog params with payload extras and strips value when disabled", () => {
    const merged = mergeEventCustomData({
      base: { value: 10, currency: "USD", items: [{ item_id: "1", item_name: "A" }] },
      extraParams: { origem: "crm" },
      catalog: {
        include_value: false,
        include_items: true,
        default_currency: "BRL",
        default_params: { funil: "comercial" },
      },
    });
    assert.equal(merged?.value, undefined);
    assert.equal(merged?.currency, undefined);
    assert.deepEqual(merged?.properties, { funil: "comercial", origem: "crm" });
    assert.equal(merged?.items?.[0]?.item_id, "1");
  });
});

describe("sanitizeGa4ExtraParams", () => {
  it("drops reserved prefixes and invalid names", () => {
    const clean = sanitizeGa4ExtraParams({
      funil: "x",
      google_secret: "no",
      ga_session: "no",
      "1bad": "no",
    });
    assert.deepEqual(clean, { funil: "x" });
  });
});
