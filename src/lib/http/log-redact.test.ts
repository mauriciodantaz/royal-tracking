import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactForLog } from "./log-redact";

describe("redactForLog", () => {
  it("masks email and bearer tokens", () => {
    const out = redactForLog(
      "user joao.silva@gmail.com Authorization: Bearer abc.def.ghi"
    );
    assert.match(out, /joa\*\*\*@gmail\.com/i);
    assert.match(out, /Bearer \*\*\*/i);
    assert.doesNotMatch(out, /abc\.def\.ghi/);
  });
});
