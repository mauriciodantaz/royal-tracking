import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generatedGaClientId,
  maskGaClientId,
  normalizeGaClientId,
  resolveGaIdentity,
  syntheticGaClientId,
} from "./ga-client-id";

const SECRET_A = "test-ga-client-id-secret-aaaa";
const SECRET_B = "test-ga-client-id-secret-bbbb";
const CREATED = "2024-01-15T12:00:00.000Z";
const CREATED_UNIX = Math.floor(Date.parse(CREATED) / 1000);

describe("normalizeGaClientId", () => {
  it("strips GA1.1 prefix", () => {
    assert.equal(
      normalizeGaClientId("GA1.1.40032303.1671533621"),
      "40032303.1671533621"
    );
  });
});

describe("syntheticGaClientId", () => {
  it("returns GA-style id with visitor created_at unix", () => {
    const id = syntheticGaClientId("trck_abc123", CREATED, SECRET_A);
    assert.ok(id);
    assert.match(id!, /^\d+\.\d+$/);
    assert.equal(id!.split(".")[1], String(CREATED_UNIX));
  });

  it("is stable for the same trck + secret + created_at", () => {
    const a = syntheticGaClientId("trck_deadbeef", CREATED, SECRET_A);
    const b = syntheticGaClientId("trck_deadbeef", CREATED, SECRET_A);
    assert.equal(a, b);
  });

  it("differs when HMAC secret differs", () => {
    const a = syntheticGaClientId("trck_same", CREATED, SECRET_A);
    const b = syntheticGaClientId("trck_same", CREATED, SECRET_B);
    assert.notEqual(a, b);
  });

  it("returns null without secret", () => {
    const prevGa = process.env.GA_CLIENT_ID_SECRET;
    const prevEnc = process.env.ENCRYPTION_KEY;
    delete process.env.GA_CLIENT_ID_SECRET;
    delete process.env.ENCRYPTION_KEY;
    try {
      assert.equal(syntheticGaClientId("trck_x", CREATED, null), null);
    } finally {
      if (prevGa !== undefined) process.env.GA_CLIENT_ID_SECRET = prevGa;
      if (prevEnc !== undefined) process.env.ENCRYPTION_KEY = prevEnc;
    }
  });
});

describe("resolveGaIdentity", () => {
  it("uses _ga when no server-managed identity", () => {
    const r = resolveGaIdentity({
      fromBrowserGa: "123456789.9876543210",
      trckUserId: "trck_abc",
      visitorCreatedAt: CREATED,
      hmacSecret: SECRET_A,
    });
    assert.equal(r.clientId, "123456789.9876543210");
    assert.equal(r.source, "ga_cookie");
    assert.equal(r.writeCookie, true);
    assert.equal(r.persist, true);
  });

  it("prefers royal_fpid cookie over synthetic", () => {
    const r = resolveGaIdentity({
      fromRtFpid: "111.222",
      trckUserId: "trck_abc",
      visitorCreatedAt: CREATED,
      hmacSecret: SECRET_A,
    });
    assert.equal(r.clientId, "111.222");
    assert.equal(r.source, "royal_fpid");
  });

  it("uses visitor_stored when present", () => {
    const r = resolveGaIdentity({
      storedClientId: "555.666",
      storedSource: "synthetic_trck",
      trckUserId: "trck_abc",
      visitorCreatedAt: CREATED,
      hmacSecret: SECRET_A,
    });
    assert.equal(r.clientId, "555.666");
    assert.equal(r.source, "visitor_stored");
    assert.equal(r.writeCookie, true);
  });

  it("derives synthetic_trck via HMAC", () => {
    const expected = syntheticGaClientId("trck_fallback_user", CREATED, SECRET_A);
    const r = resolveGaIdentity({
      trckUserId: "trck_fallback_user",
      visitorCreatedAt: CREATED,
      hmacSecret: SECRET_A,
    });
    assert.equal(r.source, "synthetic_trck");
    assert.equal(r.clientId, expected);
    assert.equal(r.writeCookie, true);
  });

  it("generates when trck exists but secret missing", () => {
    const prevGa = process.env.GA_CLIENT_ID_SECRET;
    const prevEnc = process.env.ENCRYPTION_KEY;
    delete process.env.GA_CLIENT_ID_SECRET;
    delete process.env.ENCRYPTION_KEY;
    try {
      const r = resolveGaIdentity({
        trckUserId: "trck_nosecret",
        visitorCreatedAt: CREATED,
        hmacSecret: null,
      });
      assert.equal(r.source, "generated");
      assert.match(r.clientId!, /^\d+\.\d+$/);
    } finally {
      if (prevGa !== undefined) process.env.GA_CLIENT_ID_SECRET = prevGa;
      if (prevEnc !== undefined) process.env.ENCRYPTION_KEY = prevEnc;
    }
  });

  it("returns none without identity", () => {
    const r = resolveGaIdentity({});
    assert.equal(r.clientId, null);
    assert.equal(r.source, "none");
  });

  it("keeps sticky FPID when _ga appears later and records mismatch", () => {
    const r = resolveGaIdentity({
      fromBrowserGa: "999.888",
      storedClientId: "111.222",
      storedSource: "royal_fpid",
      trckUserId: "trck_abc",
      visitorCreatedAt: CREATED,
      hmacSecret: SECRET_A,
    });
    assert.equal(r.clientId, "111.222");
    assert.equal(r.source, "visitor_stored");
    assert.equal(r.identityMismatch, true);
    assert.equal(r.browserGaClientId, "999.888");
    assert.equal(r.meta.ga_identity_mismatch, true);
  });

  it("does not treat matching _ga as mismatch", () => {
    const r = resolveGaIdentity({
      fromBrowserGa: "111.222",
      storedClientId: "111.222",
      storedSource: "ga_cookie",
      hmacSecret: SECRET_A,
    });
    assert.equal(r.identityMismatch, false);
    assert.equal(r.clientId, "111.222");
  });

  it("masks client ids for logs", () => {
    assert.equal(maskGaClientId(null), null);
    assert.match(maskGaClientId("1.2")!, /^[a-f0-9]{8}$/);
  });

  it("generatedGaClientId uses created_at unix", () => {
    const id = generatedGaClientId(CREATED);
    assert.equal(id.split(".")[1], String(CREATED_UNIX));
  });
});
