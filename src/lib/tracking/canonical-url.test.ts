import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalUrl, pageKeyFromUrl } from "./canonical-url";

describe("canonicalUrl", () => {
  it("strips utm and click ids", () => {
    const out = canonicalUrl(
      "https://Site.com/produto/?utm_source=google&utm_medium=cpc&gclid=123&categoria=camisas"
    );
    assert.equal(
      out,
      "https://site.com/produto?categoria=camisas"
    );
  });

  it("preserves allowlisted params that would otherwise strip", () => {
    const out = canonicalUrl(
      "https://site.com/p?ref=keep&utm_source=x",
      { preserveParams: ["ref"] }
    );
    assert.equal(out, "https://site.com/p?ref=keep");
  });

  it("strips trailing slash except root", () => {
    assert.equal(canonicalUrl("https://a.com/"), "https://a.com/");
    assert.equal(canonicalUrl("https://a.com/foo/"), "https://a.com/foo");
  });

  it("returns null for invalid", () => {
    assert.equal(canonicalUrl("not-a-url"), null);
  });
});

describe("pageKeyFromUrl", () => {
  it("builds host+path+query key", () => {
    assert.equal(
      pageKeyFromUrl("https://a.com/x?b=1&utm_source=z"),
      "a.com/x?b=1"
    );
  });
});
