import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { CustomEventAliasRow, CustomEventRow, Json } from "@/lib/db/types";
import {
  isValidCustomEventSlug,
  sanitizeEventParams,
  type EventParamValue,
} from "@/lib/tracking/event-params";

export type CustomEventWithAliases = CustomEventRow & {
  aliases: CustomEventAliasRow[];
};

export type CustomEventInput = {
  slug: string;
  label: string;
  meta_event_name?: string | null;
  ga4_event_name?: string | null;
  meta_enabled?: boolean;
  ga4_enabled?: boolean;
  include_value?: boolean;
  include_items?: boolean;
  default_currency?: string | null;
  default_params?: Record<string, EventParamValue>;
  active?: boolean;
  aliases?: Array<{ source_provider?: string | null; received_name: string }>;
};

function asParams(value: Json): Record<string, EventParamValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeEventParams(value as Record<string, unknown>);
}

export function catalogPolicyFromRow(row: CustomEventRow) {
  return {
    include_value: row.include_value,
    include_items: row.include_items,
    default_currency: row.default_currency,
    default_params: asParams(row.default_params),
  };
}

export async function listCustomEvents(opts?: {
  activeOnly?: boolean;
}): Promise<CustomEventWithAliases[]> {
  await ensureDbReady();
  const events = await query<CustomEventRow>(
    opts?.activeOnly
      ? `select * from custom_events where active = true order by label, slug`
      : `select * from custom_events order by active desc, label, slug`
  );
  if (events.rows.length === 0) return [];
  const ids = events.rows.map((e) => e.id);
  const aliases = await query<CustomEventAliasRow>(
    `select * from custom_event_aliases
     where custom_event_id = any($1::uuid[])
     order by received_name`,
    [ids]
  );
  const byEvent = new Map<string, CustomEventAliasRow[]>();
  for (const a of aliases.rows) {
    const list = byEvent.get(a.custom_event_id) ?? [];
    list.push(a);
    byEvent.set(a.custom_event_id, list);
  }
  return events.rows.map((row) => ({
    ...row,
    aliases: byEvent.get(row.id) ?? [],
  }));
}

export async function getCustomEventById(
  id: string
): Promise<CustomEventRow | null> {
  await ensureDbReady();
  return queryOne<CustomEventRow>(
    `select * from custom_events where id = $1 limit 1`,
    [id]
  );
}

export async function findCustomEvent(opts: {
  sourceProvider?: string | null;
  sourceEvent: string;
}): Promise<CustomEventRow | null> {
  await ensureDbReady();
  const name = opts.sourceEvent.trim();
  if (!name) return null;

  const bySlug = await queryOne<CustomEventRow>(
    `select * from custom_events
     where active = true and lower(slug) = lower($1)
     limit 1`,
    [name]
  );
  if (bySlug) return bySlug;

  if (opts.sourceProvider) {
    const byProvider = await queryOne<CustomEventRow>(
      `select e.*
       from custom_event_aliases a
       join custom_events e on e.id = a.custom_event_id
       where e.active = true
         and a.source_provider = $1
         and lower(a.received_name) = lower($2)
       limit 1`,
      [opts.sourceProvider, name]
    );
    if (byProvider) return byProvider;
  }

  return queryOne<CustomEventRow>(
    `select e.*
     from custom_event_aliases a
     join custom_events e on e.id = a.custom_event_id
     where e.active = true
       and a.source_provider is null
       and lower(a.received_name) = lower($1)
     limit 1`,
    [name]
  );
}

function normalizeAliases(
  aliases: CustomEventInput["aliases"]
): Array<{ source_provider: string | null; received_name: string }> {
  const seen = new Set<string>();
  const out: Array<{ source_provider: string | null; received_name: string }> =
    [];
  for (const a of aliases ?? []) {
    const received = String(a.received_name ?? "").trim();
    if (!received || received.length > 128) continue;
    const provider = a.source_provider?.trim() || null;
    const key = `${provider ?? "*"}:${received.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source_provider: provider, received_name: received });
  }
  return out.slice(0, 40);
}

export async function upsertCustomEvent(
  input: CustomEventInput,
  id?: string
): Promise<CustomEventRow> {
  await ensureDbReady();
  const slug = input.slug.trim().toLowerCase();
  if (!isValidCustomEventSlug(slug)) {
    throw new Error("invalid_custom_event_slug");
  }
  const label = input.label.trim();
  if (!label || label.length > 120) {
    throw new Error("invalid_custom_event_label");
  }
  const metaName = input.meta_event_name?.trim() || null;
  const ga4Name = input.ga4_event_name?.trim() || null;
  const currency = input.default_currency?.trim().toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("invalid_currency");
  }
  const params = sanitizeEventParams(input.default_params ?? {});
  const aliases = normalizeAliases(input.aliases);

  let row: CustomEventRow | null;
  if (id) {
    row = await queryOne<CustomEventRow>(
      `update custom_events set
         slug = $1,
         label = $2,
         meta_event_name = $3,
         ga4_event_name = $4,
         meta_enabled = $5,
         ga4_enabled = $6,
         include_value = $7,
         include_items = $8,
         default_currency = $9,
         default_params = $10::jsonb,
         active = $11,
         updated_at = now()
       where id = $12
       returning *`,
      [
        slug,
        label,
        metaName,
        ga4Name,
        input.meta_enabled !== false,
        input.ga4_enabled !== false,
        input.include_value !== false,
        input.include_items === true,
        currency,
        JSON.stringify(params),
        input.active !== false,
        id,
      ]
    );
  } else {
    row = await queryOne<CustomEventRow>(
      `insert into custom_events (
         slug, label, meta_event_name, ga4_event_name,
         meta_enabled, ga4_enabled, include_value, include_items,
         default_currency, default_params, active
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       returning *`,
      [
        slug,
        label,
        metaName,
        ga4Name,
        input.meta_enabled !== false,
        input.ga4_enabled !== false,
        input.include_value !== false,
        input.include_items === true,
        currency,
        JSON.stringify(params),
        input.active !== false,
      ]
    );
  }
  if (!row) throw new Error("custom_event_persist_failed");

  await query(`delete from custom_event_aliases where custom_event_id = $1`, [
    row.id,
  ]);
  for (const a of aliases) {
    await query(
      `insert into custom_event_aliases (custom_event_id, source_provider, received_name)
       values ($1,$2,$3)`,
      [row.id, a.source_provider, a.received_name]
    );
  }
  return row;
}

export async function deleteCustomEvent(id: string): Promise<void> {
  await ensureDbReady();
  await query(`delete from custom_events where id = $1`, [id]);
}
