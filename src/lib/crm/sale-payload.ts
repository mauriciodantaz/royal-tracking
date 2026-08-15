import type { MetaCustomData } from "@/lib/meta/capi";

export type CrmDealProduct = {
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
};

export function parseNumeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function stringish(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Map a CRM/Pipedrive product row to a GA4 item. */
export function parseCrmProductRow(
  row: Record<string, unknown>
): CrmDealProduct | null {
  const itemId =
    stringish(row.product_id) ||
    stringish(row.item_id) ||
    stringish(row.id);
  const itemName =
    stringish(row.name) ||
    stringish(row.product_name) ||
    stringish(row.title);
  const quantityRaw = parseNumeric(row.quantity);
  const quantity =
    quantityRaw != null && quantityRaw > 0 ? quantityRaw : 1;
  const lineTotal = parseNumeric(row.total) ?? parseNumeric(row.sum);
  const unit =
    parseNumeric(row.price) ??
    parseNumeric(row.item_price) ??
    parseNumeric(row.unit_price);
  const price =
    unit ?? (lineTotal != null ? lineTotal / quantity : undefined) ?? 0;
  if (!itemId && !itemName) return null;
  return {
    itemId: itemId || itemName || "item",
    itemName: itemName || itemId || "Item",
    quantity,
    price,
  };
}

export function parseCrmProductList(raw: unknown): CrmDealProduct[] {
  if (!Array.isArray(raw)) return [];
  const out: CrmDealProduct[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const parsed = parseCrmProductRow(row as Record<string, unknown>);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function productsValue(products: CrmDealProduct[]): number {
  return products.reduce((sum, p) => sum + p.price * p.quantity, 0);
}

export function buildCrmSaleCustomData(opts: {
  dealId: string;
  dealName?: string | null;
  value?: number;
  currency?: string | null;
  products?: CrmDealProduct[];
}): MetaCustomData {
  const products = opts.products ?? [];
  const fromProducts = productsValue(products);
  const value =
    opts.value != null && Number.isFinite(opts.value)
      ? opts.value
      : fromProducts > 0
        ? fromProducts
        : undefined;
  const currency =
    (opts.currency && opts.currency.trim().toUpperCase()) || "BRL";
  const fallbackName = opts.dealName?.trim() || "CRM deal";
  const items =
    products.length > 0
      ? products.map((p) => ({
          item_id: p.itemId,
          item_name: p.itemName,
          quantity: p.quantity,
          price: p.price,
        }))
      : [
          {
            item_id: opts.dealId,
            item_name: fallbackName,
            quantity: 1,
            price: value ?? 0,
          },
        ];
  const content_ids = items.map((i) => i.item_id);
  return {
    value,
    currency,
    content_ids,
    content_name: fallbackName,
    content_type: "product",
    items,
  };
}

export function crmPurchaseTransactionId(
  provider: "rdcrm" | "pipedrive",
  dealId: string
): string {
  return `${provider}:${dealId}`;
}
