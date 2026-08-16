import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCrmSaleCustomData,
  parseCrmProductList,
  parseCrmProductRow,
  parseNumeric,
  productsValue,
} from "./sale-payload";

describe("parseNumeric", () => {
  it("reads numbers and numeric strings", () => {
    assert.equal(parseNumeric(10.5), 10.5);
    assert.equal(parseNumeric("199.90"), 199.9);
    assert.equal(parseNumeric("1.234"), 1.234);
    assert.equal(parseNumeric(""), undefined);
    assert.equal(parseNumeric(null), undefined);
  });
});

describe("parseCrmProductRow", () => {
  it("reads DealV1 deal_products", () => {
    const p = parseCrmProductRow({
      product_id: "prod1",
      name: "Linho",
      price: 50,
      quantity: 2,
      total: 100,
    });
    assert.deepEqual(p, {
      itemId: "prod1",
      itemName: "Linho",
      quantity: 2,
      price: 50,
    });
  });

  it("reads Pipedrive deal products", () => {
    const p = parseCrmProductRow({
      id: 9,
      product_id: 44,
      name: "Tecido",
      item_price: "12.5",
      quantity: "3",
      sum: 37.5,
    });
    assert.equal(p?.itemId, "44");
    assert.equal(p?.itemName, "Tecido");
    assert.equal(p?.quantity, 3);
    assert.equal(p?.price, 12.5);
  });
});

describe("buildCrmSaleCustomData", () => {
  it("maps products to GA4 items and uses deal value", () => {
    const data = buildCrmSaleCustomData({
      dealId: "deal1",
      dealName: "Pedido Ana",
      value: 199.9,
      products: parseCrmProductList([
        { product_id: "a", name: "A", price: 100, quantity: 1 },
        { product_id: "b", name: "B", price: 50, quantity: 2 },
      ]),
    });
    assert.equal(data.value, 199.9);
    assert.equal(data.currency, "BRL");
    assert.equal(data.items?.length, 2);
    assert.equal(data.content_ids?.[0], "a");
    assert.equal(data.content_name, "Pedido Ana");
  });

  it("sums products when deal value is missing", () => {
    const products = parseCrmProductList([
      { product_id: "a", name: "A", price: 10, quantity: 2 },
    ]);
    assert.equal(productsValue(products), 20);
    const data = buildCrmSaleCustomData({ dealId: "d", products });
    assert.equal(data.value, 20);
  });

  it("adds a fallback item so purchase is valid without products", () => {
    const data = buildCrmSaleCustomData({
      dealId: "abc",
      dealName: "Negociação",
      value: 0,
    });
    assert.equal(data.items?.length, 1);
    assert.equal(data.items?.[0]?.item_id, "abc");
    assert.equal(data.items?.[0]?.item_name, "Negociação");
  });
});
