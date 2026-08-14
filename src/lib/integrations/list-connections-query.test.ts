import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildListConnectionsQuery } from "./list-connections-query";

describe("buildListConnectionsQuery", () => {
  it("passes $1 with the provider param (regression: 42P02)", () => {
    const q = buildListConnectionsQuery({
      provider: "meta_pixel",
      activeOnly: true,
    });
    assert.match(q.text, /provider = \$1/);
    assert.equal(q.params.length, 1);
    assert.equal(q.params[0], "meta_pixel");
    assert.match(q.text, /active = true/);
  });

  it("numbers $1/$2 when provider and direction are set", () => {
    const q = buildListConnectionsQuery({
      provider: "ga4",
      direction: "outbound",
    });
    assert.match(q.text, /provider = \$1/);
    assert.match(q.text, /direction = \$2/);
    assert.deepEqual(q.params, ["ga4", "outbound"]);
  });

  it("omits placeholders when there are no bind params", () => {
    const q = buildListConnectionsQuery({ activeOnly: true });
    assert.equal(q.params.length, 0);
    assert.doesNotMatch(q.text, /\$\d/);
  });
});
