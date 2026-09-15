import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGenericInbound } from "./generic-inbound-parse";

describe("parseGenericInbound", () => {
  it("reads event_name plus identity and extras", () => {
    const parsed = parseGenericInbound({
      event_name: "orcamento_aprovado",
      email: "a@b.com",
      value: 99,
      currency: "brl",
      params: { funil: "comercial" },
      items: [{ item_id: "p1", item_name: "Kit" }],
    });
    assert.ok(parsed);
    assert.equal(parsed?.sourceEvent, "orcamento_aprovado");
    assert.equal(parsed?.email, "a@b.com");
    assert.equal(parsed?.value, 99);
    assert.equal(parsed?.currency, "BRL");
    assert.equal(parsed?.params.funil, "comercial");
    assert.equal(parsed?.items?.[0]?.item_id, "p1");
  });

  it("returns null without event name", () => {
    assert.equal(parseGenericInbound({ email: "a@b.com" }), null);
  });
});
