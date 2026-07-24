import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contextFromUrl,
  evaluateRules,
  ruleMatches,
  type TrackingRule,
} from "./tracking-rules";

describe("tracking-rules", () => {
  it("matches path contains with AND", () => {
    const rule: TrackingRule = {
      id: "r1",
      match: "and",
      conditions: [
        { field: "path", op: "contains", value: "checkout" },
        { field: "hostname", op: "contains", value: "lojax.com" },
      ],
      action: "force_event",
      event_name: "begin_checkout",
    };
    const ctx = contextFromUrl("https://www.lojax.com/checkout/step");
    assert.equal(ruleMatches(rule, ctx), true);
    const evaled = evaluateRules([rule], ctx);
    assert.deepEqual(evaled.forceEvents, ["begin_checkout"]);
  });

  it("builtin excludes wp-admin pageviews", () => {
    const ctx = contextFromUrl("https://site.com/wp-admin/edit.php");
    const evaled = evaluateRules([], ctx);
    assert.equal(evaled.excludePageview, true);
  });

  it("regex path", () => {
    const rule: TrackingRule = {
      id: "r2",
      match: "and",
      conditions: [
        { field: "path", op: "regex", value: "^/produto/.*" },
      ],
      action: "force_event",
      event_name: "view_item",
    };
    assert.equal(
      ruleMatches(rule, contextFromUrl("https://a.com/produto/123")),
      true
    );
    assert.equal(
      ruleMatches(rule, contextFromUrl("https://a.com/categoria/x")),
      false
    );
  });
});
