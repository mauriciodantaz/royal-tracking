import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAppTitle, getPlatformName, getProjectName } from "./env";

function withEnv(
  patch: { PROJECT_NAME?: string; PLATFORM_NAME?: string },
  fn: () => void
): void {
  const prevProject = process.env.PROJECT_NAME;
  const prevPlatform = process.env.PLATFORM_NAME;
  try {
    if ("PROJECT_NAME" in patch) {
      if (patch.PROJECT_NAME === undefined) delete process.env.PROJECT_NAME;
      else process.env.PROJECT_NAME = patch.PROJECT_NAME;
    }
    if ("PLATFORM_NAME" in patch) {
      if (patch.PLATFORM_NAME === undefined) delete process.env.PLATFORM_NAME;
      else process.env.PLATFORM_NAME = patch.PLATFORM_NAME;
    }
    fn();
  } finally {
    if (prevProject === undefined) delete process.env.PROJECT_NAME;
    else process.env.PROJECT_NAME = prevProject;
    if (prevPlatform === undefined) delete process.env.PLATFORM_NAME;
    else process.env.PLATFORM_NAME = prevPlatform;
  }
}

describe("getPlatformName", () => {
  it("falls back to Royal Tracking when unset or blank", () => {
    withEnv({ PLATFORM_NAME: undefined }, () => {
      assert.equal(getPlatformName(), "Royal Tracking");
    });
    withEnv({ PLATFORM_NAME: "   " }, () => {
      assert.equal(getPlatformName(), "Royal Tracking");
    });
  });

  it("returns the trimmed env value when set", () => {
    withEnv({ PLATFORM_NAME: "  Acme Analytics  " }, () => {
      assert.equal(getPlatformName(), "Acme Analytics");
    });
  });
});

describe("getAppTitle", () => {
  it("is Royal Tracking when neither env is set", () => {
    withEnv({ PROJECT_NAME: undefined, PLATFORM_NAME: undefined }, () => {
      assert.equal(getProjectName(), "");
      assert.equal(getAppTitle(), "Royal Tracking");
    });
  });

  it("is PROJECT_NAME | Royal Tracking without PLATFORM_NAME", () => {
    withEnv({ PROJECT_NAME: "Fizzing", PLATFORM_NAME: undefined }, () => {
      assert.equal(getAppTitle(), "Fizzing | Royal Tracking");
    });
  });

  it("is PROJECT_NAME | PLATFORM_NAME when both are set", () => {
    withEnv(
      { PROJECT_NAME: "Fizzing", PLATFORM_NAME: "Acme Analytics" },
      () => {
        assert.equal(getAppTitle(), "Fizzing | Acme Analytics");
      }
    );
  });

  it("is PLATFORM_NAME alone when PROJECT_NAME is empty", () => {
    withEnv(
      { PROJECT_NAME: "  ", PLATFORM_NAME: "Acme Analytics" },
      () => {
        assert.equal(getAppTitle(), "Acme Analytics");
      }
    );
  });
});
