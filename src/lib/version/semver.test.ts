import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareSemVer,
  countVersionsBehind,
  maxSemVer,
  parseSemVer,
  sameSemVer,
} from "./semver";

describe("parseSemVer", () => {
  it("parses plain and v-prefixed versions", () => {
    assert.deepEqual(parseSemVer("1.2.3"), {
      major: 1,
      minor: 2,
      patch: 3,
    });
    assert.deepEqual(parseSemVer("v0.4.2"), {
      major: 0,
      minor: 4,
      patch: 2,
    });
  });

  it("rejects pre-release / invalid tags", () => {
    assert.equal(parseSemVer("1.2.3-beta"), null);
    assert.equal(parseSemVer("latest"), null);
    assert.equal(parseSemVer(""), null);
  });
});

describe("compareSemVer", () => {
  it("orders major/minor/patch", () => {
    assert.ok(
      compareSemVer(
        parseSemVer("0.4.0")!,
        parseSemVer("0.4.2")!
      ) < 0
    );
    assert.ok(
      compareSemVer(
        parseSemVer("1.0.0")!,
        parseSemVer("0.9.9")!
      ) > 0
    );
    assert.equal(
      compareSemVer(parseSemVer("1.2.3")!, parseSemVer("1.2.3")!),
      0
    );
  });
});

describe("countVersionsBehind", () => {
  it("counts unique remotes strictly greater than current", () => {
    assert.equal(
      countVersionsBehind("0.4.0", ["0.4.0", "0.4.1", "0.4.2", "0.5.0"]),
      3
    );
  });

  it("dedupes duplicate remote versions", () => {
    assert.equal(
      countVersionsBehind("0.4.0", ["0.4.1", "0.4.1", "0.4.2"]),
      2
    );
  });

  it("returns 0 when current is newest or unparseable", () => {
    assert.equal(countVersionsBehind("0.4.2", ["0.4.0", "0.4.1", "0.4.2"]), 0);
    assert.equal(countVersionsBehind("not-a-version", ["0.4.2"]), 0);
  });

  it("ignores remote strings that are not plain SemVer", () => {
    assert.equal(
      countVersionsBehind("0.4.0", ["0.4.1-beta", "latest", "0.4.2"]),
      1
    );
  });
});

describe("maxSemVer", () => {
  it("returns the highest parseable SemVer", () => {
    assert.equal(maxSemVer(["0.4.0", "0.9.1", "0.8.0", "latest"]), "0.9.1");
  });

  it("returns null when none parse", () => {
    assert.equal(maxSemVer(["latest", "beta", "0.1.0-beta"]), null);
  });
});

describe("sameSemVer", () => {
  it("compares cores ignoring v prefix", () => {
    assert.equal(sameSemVer("v0.9.1", "0.9.1"), true);
    assert.equal(sameSemVer("0.9.0", "0.9.1"), false);
  });
});
