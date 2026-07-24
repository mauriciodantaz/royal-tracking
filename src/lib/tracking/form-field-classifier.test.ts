import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyField,
  classifyFieldBag,
  pickEmailPhoneNameFromClassification,
} from "./form-field-classifier";

describe("classifyField", () => {
  it("scores type=email highest", () => {
    const r = classifyField({
      name: "field_1",
      type: "email",
      value: "a@b.com",
    });
    assert.equal(r?.kind, "email");
    assert.ok((r?.score ?? 0) >= 100);
  });

  it("detects phone from type=tel and portuguese name", () => {
    const r = classifyField({
      name: "telefone",
      id: "phone",
      type: "tel",
      placeholder: "Seu telefone",
      ariaLabel: "Celular",
      className: "phone-field",
      value: "11999998888",
    });
    assert.equal(r?.kind, "phone");
  });

  it("detects Elementor email key", () => {
    const r = classifyField({
      name: "form_fields[email]",
      value: "x@y.com",
    });
    assert.equal(r?.kind, "email");
  });

  it("detects name from nome_completo", () => {
    const r = classifyField({
      name: "nome_completo",
      value: "Maria Silva",
    });
    assert.equal(r?.kind, "name");
  });

  it("detects cpf by key + digit length", () => {
    const r = classifyField({
      name: "cpf_cliente",
      value: "12345678901",
    });
    assert.equal(r?.kind, "cpf");
  });
});

describe("classifyFieldBag", () => {
  it("picks email phone name winners", () => {
    const { classification } = classifyFieldBag({
      user_email: "a@b.com",
      celular: "11988887777",
      nome: "João",
      empresa: "Acme",
    });
    assert.equal(classification.email?.key, "user_email");
    assert.equal(classification.phone?.key, "celular");
    assert.equal(classification.name?.key, "nome");
    assert.equal(classification.company?.key, "empresa");
  });
});

describe("pickEmailPhoneNameFromClassification", () => {
  it("returns PII values from bag", () => {
    const picked = pickEmailPhoneNameFromClassification({
      "e-mail": "z@z.com",
      whatsapp: "5511999",
      full_name: "Ana",
    });
    assert.equal(picked.email, "z@z.com");
    assert.equal(picked.phone, "5511999");
    assert.equal(picked.name, "Ana");
  });
});
