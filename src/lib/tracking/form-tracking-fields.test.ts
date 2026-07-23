import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTicketFieldValue,
  isTrackingTicketField,
  isTrckUserIdField,
  normalizeFormFieldKey,
} from "./form-tracking-fields";

describe("normalizeFormFieldKey", () => {
  it("strips Elementor form_fields[…] and form-field- prefix", () => {
    assert.equal(normalizeFormFieldKey("form_fields[rt_ticket]"), "rt_ticket");
    assert.equal(normalizeFormFieldKey("form-field-rt_ticket"), "rt_ticket");
    assert.equal(normalizeFormFieldKey("rt_ticket"), "rt_ticket");
  });
});

describe("isTrackingTicketField", () => {
  it("matches convention names and Elementor wrappers", () => {
    assert.equal(isTrackingTicketField({ name: "rt_ticket" }), true);
    assert.equal(isTrackingTicketField({ name: "trck_ticket" }), true);
    assert.equal(
      isTrackingTicketField({ name: "form_fields[rt_ticket]" }),
      true
    );
    assert.equal(isTrackingTicketField({ id: "form-field-trck_ticket" }), true);
    assert.equal(isTrackingTicketField({ dataTrck: "ticket" }), true);
    assert.equal(isTrackingTicketField({ className: "foo trck-ticket" }), true);
    assert.equal(isTrackingTicketField({ name: "email" }), false);
  });
});

describe("isTrckUserIdField", () => {
  it("matches trck_user_id including Elementor name", () => {
    assert.equal(isTrckUserIdField({ name: "trck_user_id" }), true);
    assert.equal(
      isTrckUserIdField({ name: "form_fields[trck_user_id]" }),
      true
    );
    assert.equal(isTrckUserIdField({ dataTrck: "user_id" }), true);
    assert.equal(isTrckUserIdField({ name: "rt_ticket" }), false);
  });
});

describe("formatTicketFieldValue", () => {
  it("wraps ticket code for WhatsApp text=", () => {
    assert.equal(formatTicketFieldValue("xK9m2pQ7"), "[rt:xK9m2pQ7]");
  });
});
