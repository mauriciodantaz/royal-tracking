import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { destSelectValue } from "./dest-select";

const META = [
  "",
  "Lead",
  "CompleteRegistration",
  "Contact",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Subscribe",
];

const GA4 = [
  "",
  "generate_lead",
  "sign_up",
  "begin_checkout",
  "add_payment_info",
  "purchase",
  "subscribe",
];

describe("destSelectValue", () => {
  it("maps empty and preset names to the closed select", () => {
    assert.equal(destSelectValue("", META), "__none__");
    assert.equal(destSelectValue("Lead", META), "Lead");
    assert.equal(destSelectValue("Purchase", META), "Purchase");
    assert.equal(destSelectValue("generate_lead", GA4), "generate_lead");
    assert.equal(destSelectValue("purchase", GA4), "purchase");
  });

  it("opens custom mode for a free name", () => {
    assert.equal(destSelectValue("reuniao_realizada", META), "__custom__");
    assert.equal(destSelectValue("r1_agendada", GA4), "__custom__");
  });

  it("keeps the box open while editing, even if the text is a preset or empty", () => {
    assert.equal(destSelectValue("Lead", META, true), "__custom__");
    assert.equal(destSelectValue("", META, true), "__custom__");
    assert.equal(destSelectValue("InitiateCheckout", META, true), "__custom__");
    assert.equal(destSelectValue("generate_lead", GA4, true), "__custom__");
    assert.equal(destSelectValue("purchase", GA4, true), "__custom__");
    assert.equal(destSelectValue("", GA4, true), "__custom__");
  });
});
