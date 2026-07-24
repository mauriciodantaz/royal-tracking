import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hostMatchesApex,
  isRequestOriginAllowed,
  resolveCorsAllowOrigin,
} from "./allowed-origins";

function req(origin?: string, referer?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (referer) headers.set("referer", referer);
  return new Request("https://tracking.example.com/api/event", { headers });
}

describe("hostMatchesApex", () => {
  it("accepts exact and subdomain, rejects glued suffix", () => {
    assert.equal(hostMatchesApex("royalgrowth.com.br", "royalgrowth.com.br"), true);
    assert.equal(hostMatchesApex("lp.royalgrowth.com.br", "royalgrowth.com.br"), true);
    assert.equal(
      hostMatchesApex("evilroyalgrowth.com.br", "royalgrowth.com.br"),
      false
    );
  });
});

describe("isRequestOriginAllowed", () => {
  const prev = process.env.ALLOWED_EVENT_DOMAINS;
  const prevNode = process.env.NODE_ENV;

  function setNodeEnv(value: string) {
    Object.defineProperty(process.env, "NODE_ENV", {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }

  it("fail-closed in production when allowlist empty", () => {
    setNodeEnv("production");
    process.env.ALLOWED_EVENT_DOMAINS = "";
    assert.equal(
      isRequestOriginAllowed(req("https://cliente.com.br")),
      false
    );
    setNodeEnv(prevNode ?? "test");
    process.env.ALLOWED_EVENT_DOMAINS = prev;
  });

  it("allows matching apex when configured", () => {
    setNodeEnv("production");
    process.env.ALLOWED_EVENT_DOMAINS = "cliente.com.br";
    assert.equal(
      isRequestOriginAllowed(req("https://lp.cliente.com.br")),
      true
    );
    assert.equal(
      isRequestOriginAllowed(req("https://evil.com")),
      false
    );
    assert.equal(
      resolveCorsAllowOrigin(req("https://lp.cliente.com.br")),
      "https://lp.cliente.com.br"
    );
    setNodeEnv(prevNode ?? "test");
    process.env.ALLOWED_EVENT_DOMAINS = prev;
  });
});

