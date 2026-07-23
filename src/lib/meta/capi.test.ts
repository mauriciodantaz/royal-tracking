import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCapiPayload } from "./capi";

describe("buildCapiPayload", () => {
  it("adds messaging_channel=whatsapp for business_messaging (CTWA)", () => {
    const body = buildCapiPayload({
      eventName: "Lead",
      eventId: "wa_uazapi_test",
      eventTime: 1784799968,
      actionSource: "business_messaging",
      userData: {
        phoneHash: "abc",
        ctwaClid: "ARAkTestCtwaClid",
        externalIdHash: "ext",
      },
      testEventCode: "TEST123",
    });

    const event = (body.data as Record<string, unknown>[])[0]!;
    assert.equal(event.action_source, "business_messaging");
    assert.equal(event.messaging_channel, "whatsapp");
    assert.equal(
      (event.user_data as Record<string, unknown>).ctwa_clid,
      "ARAkTestCtwaClid"
    );
  });

  it("does not set messaging_channel for website action_source", () => {
    const body = buildCapiPayload({
      eventName: "Lead",
      eventId: "evt_web",
      actionSource: "website",
      userData: { emailHash: "em" },
    });
    const event = (body.data as Record<string, unknown>[])[0]!;
    assert.equal(event.action_source, "website");
    assert.equal(event.messaging_channel, undefined);
  });
});
