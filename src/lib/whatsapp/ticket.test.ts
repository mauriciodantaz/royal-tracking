import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTicketLine,
  parseTicket,
  appendOrReplaceTicket,
} from "./ticket";

describe("whatsapp ticket format", () => {
  it("formats pretty short line", () => {
    assert.equal(formatTicketLine("rt", "xK9m2pQ7"), "[rt:xK9m2pQ7]");
  });

  it("parses short and legacy", () => {
    assert.deepEqual(parseTicket("oi\n\n[rt:xK9m2pQ7]"), {
      name: "rt",
      value: "xK9m2pQ7",
    });
    assert.deepEqual(
      parseTicket("oi [ticket=rt:trck_abc123def456]"),
      { name: "rt", value: "trck_abc123def456" }
    );
  });

  it("replaces either form", () => {
    assert.equal(
      appendOrReplaceTicket("Olá!\n\n[ticket=rt:old]", "rt", "newCode12"),
      "Olá!\n\n[rt:newCode12]"
    );
    assert.equal(
      appendOrReplaceTicket("Olá!\n\n[rt:oldCode]", "md", "newCode12"),
      "Olá!\n\n[md:newCode12]"
    );
  });
});
