import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  effectiveFormAction,
  fingerprintForm,
  formMergeIdentity,
  formPathKey,
  formSamplePageUrl,
  normalizeFormLabel,
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

describe("normalizeFormLabel", () => {
  it("strips query from path-like labels", () => {
    assert.equal(
      normalizeFormLabel("/loja/busca.php?loja=970040"),
      "/loja/busca.php"
    );
  });

  it("keeps plain labels", () => {
    assert.equal(normalizeFormLabel("form_comprar"), "form_comprar");
  });
});

describe("effectiveFormAction", () => {
  it("empties action when it matches the page path", () => {
    assert.equal(
      effectiveFormAction(
        "https://shop.example/produto-a",
        "https://shop.example/produto-a?ref=1"
      ),
      ""
    );
  });

  it("keeps distinct action endpoints", () => {
    assert.equal(
      effectiveFormAction(
        "https://shop.example/mvc/store/newsletter/",
        "https://shop.example/produto-a"
      ),
      "/mvc/store/newsletter/"
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

  it("groups same ecommerce form across product pages", () => {
    const a = fingerprintForm({
      action: "https://shop.example/oxford-a",
      label: "form_comprar",
      fieldNames: ["quant"],
      pageUrl: "https://shop.example/oxford-a",
    });
    const b = fingerprintForm({
      action: "https://shop.example/oxford-b",
      label: "form_comprar",
      fieldNames: ["quant"],
      pageUrl: "https://shop.example/oxford-b",
    });
    assert.equal(a, b);
  });

  it("groups search forms with query in label", () => {
    const a = fingerprintForm({
      label: "/loja/busca.php?loja=970040",
      fieldNames: ["palavra_busca"],
      pageUrl: "https://shop.example/",
    });
    const b = fingerprintForm({
      label: "/loja/busca.php?loja=970040",
      fieldNames: ["palavra_busca"],
      pageUrl: "https://shop.example/tecidos",
    });
    assert.equal(a, b);
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

describe("formMergeIdentity", () => {
  it("matches normalized label + fields", () => {
    assert.equal(
      formMergeIdentity({
        label: "/loja/busca.php?loja=1",
        fieldNames: ["palavra_busca"],
      }),
      "/loja/busca.php|palavra_busca"
    );
  });
});
