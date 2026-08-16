import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENTS_PAGE_SIZE,
  buildListEventsQuery,
  clampEventsLimit,
  decodeEventCursor,
  encodeEventCursor,
} from "./list-events-query";

describe("clampEventsLimit", () => {
  it("defaults to 50 and caps at 100", () => {
    assert.equal(clampEventsLimit(), EVENTS_PAGE_SIZE);
    assert.equal(clampEventsLimit(50), 50);
    assert.equal(clampEventsLimit(999), 100);
    assert.equal(clampEventsLimit(0), 1);
  });
});

describe("event cursor", () => {
  it("round-trips created_at + id", () => {
    const cursor = {
      createdAt: "2026-08-15T14:32:00.000Z",
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    };
    const encoded = encodeEventCursor(cursor);
    assert.deepEqual(decodeEventCursor(encoded), cursor);
    assert.equal(decodeEventCursor("not-valid"), null);
    assert.equal(decodeEventCursor(""), null);
  });
});

describe("buildListEventsQuery", () => {
  it("pages 51 rows (limit+1) without a search", () => {
    const q = buildListEventsQuery({ limit: 50 });
    assert.match(q.text, /order by created_at desc, id desc/);
    assert.equal(q.params.at(-1), 51);
    assert.doesNotMatch(q.text, /where /);
  });

  it("applies keyset cursor and ILIKE search", () => {
    const q = buildListEventsQuery({
      limit: 50,
      cursor: {
        createdAt: "2026-08-15T14:32:00.000Z",
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
      q: "Purchase",
    });
    assert.match(q.text, /\(created_at, id\) < \(\$1::timestamptz, \$2::uuid\)/);
    assert.match(q.text, /event_name ilike \$3 escape/);
    assert.equal(q.params[0], "2026-08-15T14:32:00.000Z");
    assert.equal(q.params[1], "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    assert.equal(q.params[2], "%Purchase%");
  });

  it("adds ingest_path any() when the term matches a platform label", () => {
    const q = buildListEventsQuery({ q: "pipedrive" });
    assert.match(q.text, /ingest_path = any\(/);
    const paths = q.params.find((p) => Array.isArray(p)) as string[];
    assert.ok(paths.includes("pipedrive"));
  });
});
