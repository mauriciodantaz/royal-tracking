import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveGaClientId,
  syntheticGaClientId,
} from "./ga-client-id";

describe("syntheticGaClientId", () => {
  it("returns GA-style dotted decimals", () => {
    const id = syntheticGaClientId("trck_abc123");
    assert.match(id, /^\d+\.\d+$/);
  });

  it("is stable for the same trck_user_id", () => {
    const a = syntheticGaClientId("trck_deadbeef");
    const b = syntheticGaClientId("trck_deadbeef");
    assert.equal(a, b);
  });

  it("differs across trck_user_ids", () => {
    const a = syntheticGaClientId("trck_one");
    const b = syntheticGaClientId("trck_two");
    assert.notEqual(a, b);
  });
});

describe("resolveGaClientId", () => {
  it("prefers cookie over stored and synthetic", () => {
    const r = resolveGaClientId({
      fromCookie: "123456789.9876543210",
      stored: "111.222",
      trckUserId: "trck_abc",
    });
    assert.equal(r.clientId, "123456789.9876543210");
    assert.equal(r.source, "cookie");
    assert.equal(r.persist, true);
  });

  it("strips GA1.1 prefix from full _ga cookie", () => {
    const r = resolveGaClientId({
      fromCookie: "GA1.1.40032303.1671533621",
      trckUserId: "trck_abc",
    });
    assert.equal(r.clientId, "40032303.1671533621");
    assert.equal(r.source, "cookie");
  });

  it("uses visitor_stored when cookie missing", () => {
    const r = resolveGaClientId({
      fromCookie: null,
      stored: "555.666",
      trckUserId: "trck_abc",
    });
    assert.equal(r.clientId, "555.666");
    assert.equal(r.source, "visitor_stored");
    assert.equal(r.persist, false);
  });

  it("mints synthetic from trck when cookie and stored missing", () => {
    const r = resolveGaClientId({
      fromCookie: undefined,
      stored: null,
      trckUserId: "trck_fallback_user",
    });
    assert.equal(r.source, "synthetic_trck");
    assert.equal(r.persist, true);
    assert.equal(r.clientId, syntheticGaClientId("trck_fallback_user"));
  });

  it("returns none without trck_user_id", () => {
    const r = resolveGaClientId({
      fromCookie: "",
      stored: null,
      trckUserId: null,
    });
    assert.equal(r.clientId, null);
    assert.equal(r.source, "none");
    assert.equal(r.persist, false);
  });
});
