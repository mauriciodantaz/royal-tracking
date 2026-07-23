import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractReferralFromRaw,
  hasCtwaAttribution,
  normalizeEvolutionPayload,
  parseReferralObject,
} from "./normalize";

describe("CTWA referral parsing", () => {
  it("parses Meta Official referral object", () => {
    const ref = parseReferralObject({
      source_url: "https://facebook.com/ad",
      source_id: "123456789012345",
      source_type: "ad",
      ctwa_clid: "ARAkTestCtwaClidXYZ",
    });
    assert.equal(ref.ctwaClid, "ARAkTestCtwaClidXYZ");
    assert.equal(ref.sourceId, "123456789012345");
    assert.equal(ref.sourceType, "ad");
  });

  it("extracts referral nested in Evolution-like payload", () => {
    const raw = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "ABC123" },
        message: {
          conversation: "Oi, vim do anúncio",
          referral: {
            source_type: "ad",
            source_id: "999",
            ctwa_clid: "CTWA_NESTED_1",
          },
        },
        pushName: "Lead",
      },
    };
    const msg = normalizeEvolutionPayload(raw);
    assert.ok(msg);
    assert.equal(msg!.ctwaClid, "CTWA_NESTED_1");
    assert.equal(msg!.referralSourceId, "999");
    assert.equal(hasCtwaAttribution(msg!), true);
    assert.equal(msg!.text, "Oi, vim do anúncio");
  });

  it("deep-scans ctwa_clid without full referral", () => {
    const ref = extractReferralFromRaw({
      wrapper: { meta: { ctwa_clid: "DEEP_CLID_99" } },
    });
    assert.equal(ref.ctwaClid, "DEEP_CLID_99");
  });
});
