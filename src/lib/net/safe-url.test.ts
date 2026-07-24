import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeOutboundUrl } from "./safe-url";

describe("assertSafeOutboundUrl", () => {
  it("rejects empty and invalid URLs", async () => {
    assert.equal((await assertSafeOutboundUrl("")).ok, false);
    assert.equal((await assertSafeOutboundUrl("not-a-url")).ok, false);
  });

  it("rejects http in production-like checks and private IPs", async () => {
    const http = await assertSafeOutboundUrl("http://example.com");
    assert.equal(http.ok, false);

    const loopback = await assertSafeOutboundUrl("https://127.0.0.1");
    assert.equal(loopback.ok, false);

    const meta = await assertSafeOutboundUrl("https://169.254.169.254");
    assert.equal(meta.ok, false);

    const local = await assertSafeOutboundUrl("https://localhost");
    assert.equal(local.ok, false);
  });

  it("accepts a public https host", async () => {
    const ok = await assertSafeOutboundUrl("https://example.com/path/");
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.href, "https://example.com/path");
    }
  });
});
