import "server-only";

import type { EventRow } from "@/lib/dashboard/event-types";
import {
  buildListEventsQuery,
  encodeEventCursor,
  type ListEventsOpts,
} from "@/lib/dashboard/list-events-query";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";

export type { ListEventsOpts };

export type EventPage = {
  events: EventRow[];
  nextCursor: string | null;
};

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

export async function listRecentEvents(
  opts?: ListEventsOpts
): Promise<EventPage> {
  await ensureDbReady();
  const built = buildListEventsQuery(opts);
  const result = await query<EventRowDb>(built.text, built.params);
  const limit = built.params.at(-1) as number;
  const pageSize = limit - 1;
  const hasMore = result.rows.length > pageSize;
  const rows = hasMore ? result.rows.slice(0, pageSize) : result.rows;
  const events = rows.map(serializeRow);
  const last = events.at(-1);
  return {
    events,
    nextCursor:
      hasMore && last
        ? encodeEventCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}
