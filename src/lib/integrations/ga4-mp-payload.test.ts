import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGa4MpPayload } from "./ga4-mp-payload";

describe("buildGa4MpPayload", () => {
  it("sends purchase items, transaction_id and user_id", () => {
    const body = buildGa4MpPayload({
      eventName: "purchase",
      eventId: "evt-hash",
      clientId: "1.2",
      userId: "trck_abc",
      transactionId: "deal99",
      customData: {
        value: 50,
        currency: "BRL",
        items: [
          { item_id: "p1", item_name: "Linho", quantity: 2, price: 25 },
        ],
      },
    });
    assert.equal(body.client_id, "1.2");
    assert.equal(body.user_id, "trck_abc");
    const params = body.events[0]!.params;
    assert.equal(params.transaction_id, "deal99");
    assert.equal(params.value, 50);
    assert.equal(params.currency, "BRL");
    assert.deepEqual(params.items, [
      { item_id: "p1", item_name: "Linho", quantity: 2, price: 25 },
    ]);
  });

  it("falls back to content_ids when items are absent", () => {
    const body = buildGa4MpPayload({
      eventName: "begin_checkout",
      eventId: "e1",
      clientId: "1.2",
      customData: {
        content_ids: ["x"],
        content_name: "Deal",
      },
    });
    assert.equal(body.events[0]!.params.transaction_id, undefined);
    assert.deepEqual(body.events[0]!.params.items, [
      { item_id: "x", item_name: "Deal" },
    ]);
  });
});
