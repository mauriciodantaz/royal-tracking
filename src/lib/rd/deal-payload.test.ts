import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCrmDealFields } from "./deal-payload";

describe("parseCrmDealFields", () => {
  it("reads DealV1 nested deal_stage / deal_pipeline / amount_total", () => {
    const parsed = parseCrmDealFields({
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      status: "won",
      amount_total: 199.9,
      deal_stage: { id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Orçamento" },
      deal_pipeline: { id: "cccccccccccccccccccccccc", name: "WhatsApp" },
    });
    assert.equal(parsed.dealId, "aaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(parsed.stageId, "bbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(parsed.pipelineId, "cccccccccccccccccccccccc");
    assert.equal(parsed.dealStatus, "won");
    assert.equal(parsed.value, 199.9);
  });

  it("prefers flat v2 fields when both shapes exist", () => {
    const parsed = parseCrmDealFields({
      id: "deal1",
      stage_id: "stage-flat",
      pipeline_id: "pipe-flat",
      deal_stage: { id: "stage-nested" },
      deal_pipeline: { id: "pipe-nested" },
      total_price: 10,
      amount_total: 99,
    });
    assert.equal(parsed.stageId, "stage-flat");
    assert.equal(parsed.pipelineId, "pipe-flat");
    assert.equal(parsed.value, 10);
  });
});
