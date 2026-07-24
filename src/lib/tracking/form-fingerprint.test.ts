import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fingerprintForm,
  formPathKey,
  formSamplePageUrl,
} from "./form-fingerprint";

describe("formPathKey", () => {
  it("drops query and hash", () => {
    assert.equal(
      formPathKey("https://vocenoshape.com.br/?cupom=ROBB"),
      "/"
    );
    assert.equal(
      formPathKey("https://vocenoshape.com.br/contato?x=1#y"),
      "/contato"
    );
  });

  it("normalizes relative action against page base", () => {
    assert.equal(
      formPathKey("?cupom=ROBB", "https://vocenoshape.com.br/"),
      "/"
    );
    assert.equal(
      formPathKey("/obrigado?utm_source=x", "https://example.com/a"),
      "/obrigado"
    );
  });
});

describe("formSamplePageUrl", () => {
  it("keeps origin+path only", () => {
    assert.equal(
      formSamplePageUrl("https://vocenoshape.com.br/?cupom=ROBB"),
      "https://vocenoshape.com.br/"
    );
  });
});

describe("fingerprintForm", () => {
  const fields = ["email", "name", "phone"];

  it("ignores page and action query variations", () => {
    const a = fingerprintForm({
      action: "https://vocenoshape.com.br/?cupom=A",
      label: "forms-prime",
      fieldNames: fields,
      pageUrl: "https://vocenoshape.com.br/?cupom=A",
    });
    const b = fingerprintForm({
      action: "https://vocenoshape.com.br/?cupom=B",
      label: "forms-prime",
      fieldNames: fields,
      pageUrl: "https://vocenoshape.com.br/?cupom=B",
    });
    const c = fingerprintForm({
      action: "?cupom=C",
      label: "forms-prime",
      fieldNames: fields,
      pageUrl: "https://vocenoshape.com.br/",
    });
    assert.equal(a, b);
    assert.equal(a, c);
  });

  it("still differs by label or fields", () => {
    const base = fingerprintForm({
      action: "/",
      label: "forms-prime",
      fieldNames: fields,
      pageUrl: "https://vocenoshape.com.br/",
    });
    const otherLabel = fingerprintForm({
      action: "/",
      label: "other",
      fieldNames: fields,
      pageUrl: "https://vocenoshape.com.br/",
    });
    const otherFields = fingerprintForm({
      action: "/",
      label: "forms-prime",
      fieldNames: ["email"],
      pageUrl: "https://vocenoshape.com.br/",
    });
    assert.notEqual(base, otherLabel);
    assert.notEqual(base, otherFields);
  });
});
