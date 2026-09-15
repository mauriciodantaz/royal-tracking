import { sanitizeEventParams } from "@/lib/tracking/event-params";

export type GenericInboundParsed = {
  sourceEvent: string;
  eventId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  trckUserId: string | null;
  value?: number;
  currency?: string;
  items?: Array<{
    item_id: string;
    item_name: string;
    quantity?: number;
    price?: number;
  }>;
  params: Record<string, string | number | boolean>;
  eventSourceUrl: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseGenericInbound(raw: unknown): GenericInboundParsed | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const sourceEvent = str(rec.event) || str(rec.event_name);
  if (!sourceEvent) return null;

  const user = asRecord(rec.user) || asRecord(rec.user_data) || rec;
  const email = str(user.email) || str(rec.email);
  const phone = str(user.phone) || str(rec.phone);
  const name = str(user.name) || str(rec.name);
  const trckUserId = str(rec.trck_user_id) || str(user.trck_user_id);

  let value: number | undefined;
  if (typeof rec.value === "number" && Number.isFinite(rec.value)) {
    value = rec.value;
  }
  const currency = str(rec.currency)?.toUpperCase();
  const items = Array.isArray(rec.items)
    ? rec.items
        .filter((row): row is Record<string, unknown> =>
          Boolean(row && typeof row === "object" && !Array.isArray(row))
        )
        .map((row) => ({
          item_id: String(row.item_id ?? row.id ?? ""),
          item_name: String(row.item_name ?? row.name ?? ""),
          quantity: typeof row.quantity === "number" ? row.quantity : undefined,
          price: typeof row.price === "number" ? row.price : undefined,
        }))
        .filter((row) => row.item_id && row.item_name)
        .slice(0, 50)
    : undefined;

  const params = sanitizeEventParams(
    asRecord(rec.params) ?? asRecord(rec.properties) ?? undefined
  );

  return {
    sourceEvent,
    eventId: str(rec.event_id),
    email,
    phone,
    name,
    trckUserId,
    value,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    items: items && items.length > 0 ? items : undefined,
    params,
    eventSourceUrl: str(rec.event_source_url) || str(rec.page_url),
  };
}
