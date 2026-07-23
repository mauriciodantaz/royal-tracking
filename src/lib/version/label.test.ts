import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatVersionLabel } from "./label";

describe("formatVersionLabel", () => {
  it("shows LATEST when on tip of latest", () => {
    assert.equal(
      formatVersionLabel({
        version: "0.9.1",
        channel: "latest",
        onChannelTip: true,
        versionsBehind: 0,
      }),
      "versão 0.9.1 · LATEST"
    );
  });

  it("shows behind count without LATEST badge", () => {
    assert.equal(
      formatVersionLabel({
        version: "0.8.0",
        channel: "latest",
        onChannelTip: false,
        versionsBehind: 2,
      }),
      "versão 0.8.0 · 2 versões atrás"
    );
    assert.equal(
      formatVersionLabel({
        version: "0.8.0",
        channel: "latest",
        onChannelTip: false,
        versionsBehind: 1,
      }),
      "versão 0.8.0 · 1 versão atrás"
    );
  });

  it("shows beta badge when on tip of beta", () => {
    assert.equal(
      formatVersionLabel({
        version: "0.9.1",
        channel: "beta",
        onChannelTip: true,
        versionsBehind: 0,
      }),
      "versão 0.9.1 · beta"
    );
  });

  it("shows behind vs LATEST when beta is not tip", () => {
    assert.equal(
      formatVersionLabel({
        version: "0.8.0",
        channel: "beta",
        onChannelTip: false,
        versionsBehind: 3,
      }),
      "versão 0.8.0 · 3 versões atrás"
    );
  });

  it("omits badge when Hub unavailable", () => {
    assert.equal(
      formatVersionLabel({
        version: "0.9.1",
        channel: "latest",
        onChannelTip: false,
        versionsBehind: null,
      }),
      "versão 0.9.1"
    );
  });
});
