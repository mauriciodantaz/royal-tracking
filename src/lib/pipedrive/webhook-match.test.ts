import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickPipedriveDealWebhook } from "./webhook-match";

const inbound = "https://track.example.com/api/w/abc123xyz";

describe("pickPipedriveDealWebhook", () => {
  it("reuses the stored id when it still points at this connection URL", () => {
    const choice = pickPipedriveDealWebhook({
      storedId: "1920112",
      inboundUrl: inbound,
      webhooks: [
        {
          id: "1920112",
          subscriptionUrl: `${inbound}/`,
          httpAuthUser: null,
        },
      ],
    });
    assert.deepEqual(choice, { action: "reuse", id: "1920112" });
  });

  it("creates when the stored id is gone and no row has this URL", () => {
    const choice = pickPipedriveDealWebhook({
      storedId: "1894772",
      inboundUrl: inbound,
      webhooks: [
        {
          id: "100",
          subscriptionUrl: "https://other.example/api/w/other",
          httpAuthUser: null,
        },
      ],
    });
    assert.deepEqual(choice, { action: "create" });
  });

  it("adopts the listed id when metadata was cleared but the URL is already registered", () => {
    const choice = pickPipedriveDealWebhook({
      storedId: null,
      inboundUrl: inbound,
      webhooks: [
        {
          id: "1920112",
          subscriptionUrl: inbound,
          httpAuthUser: null,
        },
      ],
    });
    assert.deepEqual(choice, { action: "reuse", id: "1920112" });
  });

  it("adopts the matching URL when the stored id is an orphan", () => {
    const choice = pickPipedriveDealWebhook({
      storedId: "1894772",
      inboundUrl: inbound,
      webhooks: [
        {
          id: "1920112",
          subscriptionUrl: inbound,
          httpAuthUser: null,
        },
      ],
    });
    assert.deepEqual(choice, { action: "reuse", id: "1920112" });
  });

  it("creates when the stored id exists with a different URL and nothing else matches", () => {
    const choice = pickPipedriveDealWebhook({
      storedId: "1920112",
      inboundUrl: inbound,
      webhooks: [
        {
          id: "1920112",
          subscriptionUrl: "https://old.example/api/w/abc123xyz",
          httpAuthUser: null,
        },
      ],
    });
    assert.deepEqual(choice, { action: "create" });
  });
});
