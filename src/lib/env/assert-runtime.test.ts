import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectRuntimeEnvErrors,
  isEnvPlaceholder,
} from "./assert-runtime";

describe("isEnvPlaceholder", () => {
  it("flags empty, angle brackets and CHANGE_ME_* tokens", () => {
    assert.equal(isEnvPlaceholder(""), true);
    assert.equal(isEnvPlaceholder("  "), true);
    assert.equal(isEnvPlaceholder("https://<DOMAIN>"), true);
    assert.equal(isEnvPlaceholder("<APEX_DOMAIN>"), true);
    assert.equal(isEnvPlaceholder("CHANGE_ME_ADMIN_PASSWORD"), true);
    assert.equal(isEnvPlaceholder("CHANGE_ME"), true);
  });

  it("allows real values including local secrets with change-me mid-string", () => {
    assert.equal(isEnvPlaceholder("cliente.com.br"), false);
    assert.equal(isEnvPlaceholder("https://tracking.cliente.com.br"), false);
    assert.equal(
      isEnvPlaceholder("local-dev-auth-secret-change-me-32"),
      false
    );
  });
});

describe("collectRuntimeEnvErrors", () => {
  it("skips non-production", () => {
    assert.deepEqual(
      collectRuntimeEnvErrors({ NODE_ENV: "development" }),
      []
    );
  });

  it("requires allowlist and secrets in production", () => {
    const errors = collectRuntimeEnvErrors({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://tracking.cliente.com.br",
      ALLOWED_EVENT_DOMAINS: "",
      ENCRYPTION_KEY: "x".repeat(32),
      AUTH_SECRET: "y".repeat(32),
      ADMIN_EMAIL: "admin@cliente.com.br",
      ADMIN_PASSWORD: "secret-password",
    });
    assert.ok(errors.some((e) => e.includes("ALLOWED_EVENT_DOMAINS")));
  });

  it("rejects stack placeholders", () => {
    const errors = collectRuntimeEnvErrors({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://<DOMAIN>",
      ALLOWED_EVENT_DOMAINS: "<APEX_DOMAIN>",
      ENCRYPTION_KEY: "CHANGE_ME_ENCRYPTION_KEY_MIN_32_CHARS",
      AUTH_SECRET: "CHANGE_ME_AUTH_SECRET_MIN_32_CHARS",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "CHANGE_ME_ADMIN_PASSWORD",
    });
    assert.ok(errors.length >= 4);
  });

  it("accepts a complete production env", () => {
    assert.deepEqual(
      collectRuntimeEnvErrors({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://tracking.cliente.com.br",
        ALLOWED_EVENT_DOMAINS: "cliente.com.br",
        ENCRYPTION_KEY: "x".repeat(32),
        AUTH_SECRET: "y".repeat(32),
        ADMIN_EMAIL: "admin@cliente.com.br",
        ADMIN_PASSWORD: "secret-password",
      }),
      []
    );
  });
});
