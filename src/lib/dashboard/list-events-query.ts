import { ingestPathsMatchingSearch } from "@/lib/dashboard/ingest-path-label";

export const EVENTS_PAGE_SIZE = 50;
export const EVENTS_MAX_PAGE_SIZE = 100;

export type EventListCursor = {
  createdAt: string;
  id: string;
};

export type ListEventsOpts = {
  limit?: number;
  cursor?: EventListCursor | null;
  q?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_COLUMNS = `id, event_name, event_id, trck_user_id, utm_source, utm_campaign,
            geo_country, geo_city, created_at, payload_meta, response_meta,
            payload_ga4, response_ga4,
            ingest_path, channel_class, web_meta, web_ga4, server_meta, server_ga4`;

export function clampEventsLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return EVENTS_PAGE_SIZE;
  return Math.min(EVENTS_MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export function encodeEventCursor(cursor: EventListCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt, i: cursor.id }),
    "utf8"
  ).toString("base64url");
}

export function decodeEventCursor(
  raw: string | null | undefined
): EventListCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), "base64url").toString("utf8")
    ) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string") {
      return null;
    }
    if (!UUID_RE.test(parsed.i)) return null;
    const ms = Date.parse(parsed.t);
    if (!Number.isFinite(ms)) return null;
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    return null;
  }
}

function likePattern(term: string): string {
  return `%${term.replace(/([\\%_])/g, "\\$1")}%`;
}

/** Pure SQL builder for events_log pagination. */
export function buildListEventsQuery(opts?: ListEventsOpts): {
  text: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const q = opts?.q?.trim() ?? "";

  if (opts?.cursor) {
    params.push(opts.cursor.createdAt, opts.cursor.id);
    clauses.push(
      `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`
    );
  }

  if (q) {
    params.push(likePattern(q));
    const likeIdx = params.length;
    const like = `ilike $${likeIdx} escape '\\'`;
    const searchParts = [
      `event_name ${like}`,
      `event_id ${like}`,
      `coalesce(trck_user_id, '') ${like}`,
      `coalesce(utm_source, '') ${like}`,
      `coalesce(utm_campaign, '') ${like}`,
      `coalesce(ingest_path, '') ${like}`,
    ];
    const paths = ingestPathsMatchingSearch(q);
    if (paths.length) {
      params.push(paths);
      searchParts.push(`ingest_path = any($${params.length}::text[])`);
    }
    clauses.push(`(${searchParts.join(" or ")})`);
  }

  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  params.push(clampEventsLimit(opts?.limit) + 1);
  return {
    text: `select ${EVENT_COLUMNS}
     from events_log
     ${where}
     order by created_at desc, id desc
     limit $${params.length}`,
    params,
  };
}
