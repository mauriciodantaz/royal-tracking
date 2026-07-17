import "server-only";

import type { EventRow } from "@/lib/dashboard/event-types";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";

type EventRowDb = Omit<EventRow, "created_at"> & {
  created_at: Date | string;
};

function serializeRow(row: EventRowDb): EventRow {
  return {
    ...row,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function listRecentEvents(limit = 200): Promise<EventRow[]> {
  await ensureDbReady();
  const result = await query<EventRowDb>(
    `select id, event_name, event_id, trck_user_id, utm_source, utm_campaign,
            geo_country, geo_city, created_at, payload_meta, response_meta,
            payload_ga4, response_ga4,
            ingest_path, channel_class, web_meta, web_ga4, server_meta, server_ga4
     from events_log
     order by created_at desc
     limit $1`,
    [limit]
  );
  return result.rows.map(serializeRow);
}
