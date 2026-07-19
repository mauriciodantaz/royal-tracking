import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTicketLine,
  parseTicket,
  appendOrReplaceTicket,
} from "./ticket";

describe("whatsapp ticket format", () => {
  it("formats [rt:code]", () => {
    assert.equal(formatTicketLine("xK9m2pQ7"), "[rt:xK9m2pQ7]");
  });

  it("parses [rt:code] only", () => {
    assert.deepEqual(parseTicket("oi\n\n[rt:xK9m2pQ7]"), {
      name: "rt",
      value: "xK9m2pQ7",
    });
    assert.equal(parseTicket("oi [ticket=rt:trck_abc]"), null);
    assert.equal(parseTicket("oi [md:xK9m2pQ7]"), null);
  });

  it("keeps message and puts ticket at the end", () => {
    assert.equal(
      appendOrReplaceTicket("*MD*\n\nOlá! Tudo bem?", "xK9m2pQ7"),
      "*MD*\n\nOlá! Tudo bem?\n\n[rt:xK9m2pQ7]"
    );
    assert.equal(
      appendOrReplaceTicket("Olá!\n\n[rt:oldCode]", "newCode12"),
      "Olá!\n\n[rt:newCode12]"
    );
  });
});
