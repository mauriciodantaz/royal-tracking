import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { looksLikeMaskedSecret, maskSecret } from "./mask-secret";

describe("maskSecret", () => {
  it("returns empty for empty input", () => {
    assert.equal(maskSecret(""), "");
  });

  it("masks short secrets entirely (len <= 10)", () => {
    assert.equal(maskSecret("abcdefghij"), "••••••••••");
    assert.equal(maskSecret("short"), "•••••");
  });

  it("keeps first 5 and last 5 for longer secrets", () => {
    const plain = "abcdefghijklmnop"; // 16
    assert.equal(maskSecret(plain), "abcde••••••lmnop");
    assert.equal(maskSecret(plain).length, plain.length);
  });

  it("handles length 11 (one middle bullet)", () => {
    const plain = "abcdefghijk";
    assert.equal(maskSecret(plain), "abcde•ghijk");
  });
});

describe("looksLikeMaskedSecret", () => {
  it("detects full-bullet and tip-tail masks", () => {
    assert.equal(looksLikeMaskedSecret("••••••••••"), true);
    assert.equal(looksLikeMaskedSecret("abcde••••••lmnop"), true);
    assert.equal(looksLikeMaskedSecret("abcde•ghijk"), true);
  });

  it("rejects real secrets and empty", () => {
    assert.equal(looksLikeMaskedSecret(""), false);
    assert.equal(looksLikeMaskedSecret("EAAB1234567890real"), false);
    assert.equal(looksLikeMaskedSecret("plain-token-value"), false);
  });
});
