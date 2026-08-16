import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ingestPathLabel,
  ingestPathsMatchingSearch,
} from "./ingest-path-label";

describe("ingestPathLabel", () => {
  it("maps legacy channels and registry providers", () => {
    assert.equal(ingestPathLabel("snippet"), "Snippet");
    assert.equal(ingestPathLabel("webhook"), "Webhook");
    assert.equal(ingestPathLabel("api"), "API");
    assert.equal(ingestPathLabel("rdstation_crm"), "RD Station CRM");
    assert.equal(ingestPathLabel("pipedrive"), "Pipedrive");
    assert.equal(ingestPathLabel("hotmart"), "Hotmart");
    assert.equal(ingestPathLabel("evolution_api"), "Evolution API");
    assert.equal(ingestPathLabel(""), "—");
    assert.equal(ingestPathLabel(null), "—");
    assert.equal(ingestPathLabel("custom_source"), "custom_source");
  });
});

describe("ingestPathsMatchingSearch", () => {
  it("matches label and slug", () => {
    const rd = ingestPathsMatchingSearch("RD Station CRM");
    assert.ok(rd.includes("rdstation_crm"));
    const pipe = ingestPathsMatchingSearch("pipedrive");
    assert.ok(pipe.includes("pipedrive"));
    const snippet = ingestPathsMatchingSearch("snippet");
    assert.ok(snippet.includes("snippet"));
    assert.deepEqual(ingestPathsMatchingSearch("   "), []);
  });
});
