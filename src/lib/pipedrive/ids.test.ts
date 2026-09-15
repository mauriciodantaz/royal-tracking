import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPipedriveDealEntity, pipedriveId } from "./ids";

describe("pipedriveId", () => {
  it("reads scalars and API v1 objects", () => {
    assert.equal(pipedriveId(12), "12");
    assert.equal(pipedriveId("34"), "34");
    assert.equal(pipedriveId({ value: 56, name: "Ana" }), "56");
    assert.equal(pipedriveId({ id: 78 }), "78");
    assert.equal(pipedriveId("[object Object]"), null);
    assert.equal(pipedriveId(null), null);
  });
});

describe("isPipedriveDealEntity", () => {
  it("accepts deal case-insensitively and empty entity", () => {
    assert.equal(isPipedriveDealEntity("deal"), true);
    assert.equal(isPipedriveDealEntity("Deal"), true);
    assert.equal(isPipedriveDealEntity(null), true);
    assert.equal(isPipedriveDealEntity("person"), false);
  });
});
