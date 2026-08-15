import {
  parseCrmProductList,
  parseNumeric,
  type CrmDealProduct,
} from "@/lib/crm/sale-payload";

export type CrmDealStatus = "won" | "lost";

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function isCrmDealStatus(v: unknown): v is CrmDealStatus {
  return v === "won" || v === "lost";
}

export function stringId(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  return null;
}

/** DealV1 webhook nests `{ id }` under deal_stage / deal_pipeline. */
export function nestedId(parent: unknown, key: string): string | null {
  const rec = asRecord(parent);
  if (!rec) return null;
  return stringId(asRecord(rec[key])?.id);
}

export function parseCrmDealFields(document: Record<string, unknown>): {
  dealId: string | null;
  stageId: string | null;
  pipelineId: string | null;
  dealStatus: CrmDealStatus | null;
  value: number | undefined;
  contactIds: string[];
  dealName: string | null;
  products: CrmDealProduct[];
} {
  const dealId = stringId(document.id) || stringId(document.deal_id);
  const stageId =
    stringId(document.stage_id) ||
    stringId(document.deal_stage_id) ||
    nestedId(document, "deal_stage");
  const pipelineId =
    stringId(document.pipeline_id) ||
    stringId(document.deal_pipeline_id) ||
    nestedId(document, "deal_pipeline");
  const dealStatus = isCrmDealStatus(document.status) ? document.status : null;

  const value =
    parseNumeric(document.total_price) ??
    parseNumeric(document.one_time_price) ??
    parseNumeric(document.amount_total) ??
    parseNumeric(document.amount_unique);

  const contactIds = Array.isArray(document.contact_ids)
    ? document.contact_ids.filter((x): x is string => typeof x === "string")
    : [];

  const dealName =
    (typeof document.name === "string" && document.name.trim()) ||
    (typeof document.title === "string" && document.title.trim()) ||
    null;

  const products = parseCrmProductList(
    document.deal_products ?? document.products
  );

  return {
    dealId,
    stageId,
    pipelineId,
    dealStatus,
    value,
    contactIds,
    dealName,
    products,
  };
}
