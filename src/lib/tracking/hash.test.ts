import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashPhone, normalizePhone } from "./hash";

describe("normalizePhone BR", () => {
  it("prefixes 55 for 11-digit mobile with DDD", () => {
    assert.equal(normalizePhone("(11) 98765-4321"), "5511987654321");
  });

  it("prefixes 55 for 10-digit landline with DDD", () => {
    assert.equal(normalizePhone("11 3456-7890"), "551134567890");
  });

  it("keeps numbers that already include 55", () => {
    assert.equal(normalizePhone("+55 11 98765-4321"), "5511987654321");
  });

  it("strips leading trunk zeros", () => {
    assert.equal(normalizePhone("011987654321"), "5511987654321");
  });

  it("hashes the same handset across formats", () => {
    assert.equal(hashPhone("11987654321"), hashPhone("+5511987654321"));
    assert.equal(hashPhone("(11) 98765-4321"), hashPhone("5511987654321"));
  });
});
