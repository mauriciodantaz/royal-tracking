import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeRdConversasPayload } from "./normalize";

const sampleBody = {
  content: {
    id: "6a5d1303b632daeddacb3383",
    message: "ola como vai [ticket=rt:abc]",
    type: "text",
    action: "on_attendance",
  },
  contact: {
    id: "6a3d7c3fb3afda03acb3bae7",
    name: "Mauricio Dantas",
    phone: "5511998311638",
    channel: "whatsapp",
    channel_label: "FIXO",
  },
};

describe("normalizeRdConversasPayload", () => {
  it("parses direct Tallos body", () => {
    const msg = normalizeRdConversasPayload(sampleBody);
    assert.ok(msg);
    assert.equal(msg!.messageId, "6a5d1303b632daeddacb3383");
    assert.equal(msg!.phone, "5511998311638");
    assert.equal(msg!.pushName, "Mauricio Dantas");
    assert.equal(msg!.text, "ola como vai [ticket=rt:abc]");
    assert.equal(msg!.fromMe, false);
    assert.equal(msg!.isGroup, false);
    assert.equal(msg!.provider, "rdstation_conversas");
  });

  it("unwraps n8n-style array envelope", () => {
    const msg = normalizeRdConversasPayload([
      {
        headers: { host: "example.com" },
        body: sampleBody,
        webhookUrl: "https://example.com/hook",
        executionMode: "production",
      },
    ]);
    assert.ok(msg);
    assert.equal(msg!.messageId, "6a5d1303b632daeddacb3383");
    assert.equal(msg!.phone, "5511998311638");
  });

  it("ignores non-text types", () => {
    const msg = normalizeRdConversasPayload({
      ...sampleBody,
      content: { ...sampleBody.content, type: "image" },
    });
    assert.equal(msg, null);
  });

  it("ignores missing phone", () => {
    const msg = normalizeRdConversasPayload({
      ...sampleBody,
      contact: { ...sampleBody.contact, phone: "" },
    });
    assert.equal(msg, null);
  });
});
