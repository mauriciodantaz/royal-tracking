import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";

export type OverviewMetrics = {
  uniqueVisitors: number;
  eventsByType: Array<{ name: string; count: number }>;
  purchases: number;
  conversionRate: number;
  funnel: {
    visited: number;
    checkout: number;
    purchase: number;
    visitToCheckout: number;
    checkoutToPurchase: number;
    visitToPurchase: number;
  };
};

export type VolumeRange = "24h" | "7d" | "30d";

export type VolumeMetrics = {
  range: VolumeRange;
  total: number;
  webServer: number;
  serverOnly: number;
  webOnly: number;
  unknown: number;
  /** server_only / total — eventos que o pixel web sozinho não teria capturado */
  lossWithoutPlatformPct: number;
  lossWithoutPlatformCount: number;
  /** (web_server + server_only) / total */
  serverCoveragePct: number;
  byEvent: Array<{
    name: string;
    total: number;
    webServer: number;
    serverOnly: number;
    webOnly: number;
  }>;
  byDestination: {
    meta: { web: number; server: number; serverOnlyPct: number };
    ga4: { web: number; server: number; serverOnlyPct: number };
  };
};

const RANGE_INTERVAL: Record<VolumeRange, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

export function parseVolumeRange(raw: string | undefined | null): VolumeRange {
  if (raw === "24h" || raw === "30d" || raw === "7d") return raw;
  return "7d";
}

const CHECKOUT_EVENTS = new Set([
  "InitiateCheckout",
  "initiate_checkout",
  "Checkout",
  "checkout",
  "AddToCart",
]);

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  await ensureDbReady();

  const [visitorsRes, eventsRes, purchasesRes, purchaseRowsRes] =
    await Promise.all([
      queryOne<{ count: string }>(`select count(*)::text as count from visitors`),
      query<{ event_name: string; trck_user_id: string | null }>(
        `select event_name, trck_user_id from events_log`
      ),
      queryOne<{ count: string }>(
        `select count(*)::text as count from purchases
         where status is null or status not ilike '%refund%'`
      ),
      query<{ trck_user_id: string | null }>(
        `select trck_user_id from purchases where trck_user_id is not null`
      ),
    ]);

  const uniqueVisitors = Number(visitorsRes?.count ?? 0);
  const purchases = Number(purchasesRes?.count ?? 0);
  const events = eventsRes.rows;

  const byType = new Map<string, number>();
  const visitedUsers = new Set<string>();
  const checkoutUsers = new Set<string>();
  const purchaseUsers = new Set<string>();

  for (const e of events) {
    byType.set(e.event_name, (byType.get(e.event_name) ?? 0) + 1);
    if (e.trck_user_id) {
      visitedUsers.add(e.trck_user_id);
      if (CHECKOUT_EVENTS.has(e.event_name)) {
        checkoutUsers.add(e.trck_user_id);
      }
      if (e.event_name === "Purchase" || e.event_name === "purchase") {
        purchaseUsers.add(e.trck_user_id);
      }
    }
  }

  for (const p of purchaseRowsRes.rows) {
    if (p.trck_user_id) purchaseUsers.add(p.trck_user_id);
  }

  const visited = Math.max(uniqueVisitors, visitedUsers.size);
  const checkout = checkoutUsers.size;
  const purchase = purchaseUsers.size;

  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  return {
    uniqueVisitors,
    eventsByType: [...byType.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    purchases,
    conversionRate: pct(purchases, uniqueVisitors),
    funnel: {
      visited,
      checkout,
      purchase,
      visitToCheckout: pct(checkout, visited),
      checkoutToPurchase: pct(purchase, checkout || visited),
      visitToPurchase: pct(purchase, visited),
    },
  };
}

function pct(a: number, b: number) {
  return b > 0 ? (a / b) * 100 : 0;
}

const WA_PROVIDERS = [
  "evolution_api",
  "uazapi",
  "rdstation_conversas",
] as const;

export type WhatsappQualityMetrics = {
  range: VolumeRange;
  total: number;
  withTicketPct: number;
  withCtwaPct: number;
  withGclidPct: number;
  withFbcPct: number;
  matchedPct: number;
  unmatchedPct: number;
  avgSecondsIdentifyToLead: number | null;
};

/** Quality of WhatsApp inbound leads (ticket / CTWA / click IDs). */
export async function getWhatsappQualityMetrics(
  range: VolumeRange = "7d"
): Promise<WhatsappQualityMetrics> {
  await ensureDbReady();
  const interval = RANGE_INTERVAL[range];

  const row = await queryOne<{
    total: string;
    with_ticket: string;
    with_ctwa: string;
    with_gclid: string;
    with_fbc: string;
    matched: string;
    unmatched: string;
    avg_sec: string | null;
  }>(
    `select
       count(*)::text as total,
       count(*) filter (
         where coalesce(match_reason, '') ilike '%ticket%'
            or (fields ? 'ticket_value' and nullif(fields->>'ticket_value', '') is not null)
       )::text as with_ticket,
       count(*) filter (
         where ctwa_clid is not null
            or coalesce(match_reason, '') ilike '%ctwa%'
       )::text as with_ctwa,
       count(*) filter (where gclid is not null)::text as with_gclid,
       count(*) filter (where fbc is not null)::text as with_fbc,
       count(*) filter (where match_status = 'matched')::text as matched,
       count(*) filter (
         where match_status = 'unmatched'
            or coalesce(match_reason, '') ilike '%unmatched%'
            or coalesce(match_reason, '') ilike '%no_visitor%'
       )::text as unmatched,
       (
         select avg(extract(epoch from (l.created_at - v.created_at)))::text
         from form_leads l
         join visitors v on v.trck_user_id = l.trck_user_id
         where l.source_provider = any($2::text[])
           and l.created_at >= now() - $1::interval
           and l.trck_user_id is not null
           and l.created_at >= v.created_at
       ) as avg_sec
     from form_leads
     where source_provider = any($2::text[])
       and created_at >= now() - $1::interval`,
    [interval, [...WA_PROVIDERS]]
  );

  const total = Number(row?.total ?? 0);
  const withTicket = Number(row?.with_ticket ?? 0);
  const withCtwa = Number(row?.with_ctwa ?? 0);
  const withGclid = Number(row?.with_gclid ?? 0);
  const withFbc = Number(row?.with_fbc ?? 0);
  const matched = Number(row?.matched ?? 0);
  const unmatched = Number(row?.unmatched ?? 0);
  const avgSec =
    row?.avg_sec != null && row.avg_sec !== ""
      ? Number(row.avg_sec)
      : null;

  return {
    range,
    total,
    withTicketPct: pct(withTicket, total),
    withCtwaPct: pct(withCtwa, total),
    withGclidPct: pct(withGclid, total),
    withFbcPct: pct(withFbc, total),
    matchedPct: pct(matched, total),
    unmatchedPct: pct(unmatched, total),
    avgSecondsIdentifyToLead:
      avgSec != null && Number.isFinite(avgSec) ? avgSec : null,
  };
}

export async function getVolumeMetrics(
  range: VolumeRange = "7d"
): Promise<VolumeMetrics> {
  await ensureDbReady();
  const interval = RANGE_INTERVAL[range];

  const [totalsRes, byEventRes, destRes] = await Promise.all([
    queryOne<{
      total: string;
      web_server: string;
      server_only: string;
      web_only: string;
      unknown: string;
    }>(
      `select
         count(*)::text as total,
         count(*) filter (where channel_class = 'web_server')::text as web_server,
         count(*) filter (where channel_class = 'server_only')::text as server_only,
         count(*) filter (where channel_class = 'web_only')::text as web_only,
         count(*) filter (where channel_class is null)::text as unknown
       from events_log
       where created_at >= now() - $1::interval`,
      [interval]
    ),
    query<{
      event_name: string;
      total: string;
      web_server: string;
      server_only: string;
      web_only: string;
    }>(
      `select
         event_name,
         count(*)::text as total,
         count(*) filter (where channel_class = 'web_server')::text as web_server,
         count(*) filter (where channel_class = 'server_only')::text as server_only,
         count(*) filter (where channel_class = 'web_only')::text as web_only
       from events_log
       where created_at >= now() - $1::interval
       group by event_name
       order by count(*) desc
       limit 20`,
      [interval]
    ),
    queryOne<{
      meta_web: string;
      meta_server: string;
      meta_server_only: string;
      ga4_web: string;
      ga4_server: string;
      ga4_server_only: string;
    }>(
      `select
         count(*) filter (where web_meta is true)::text as meta_web,
         count(*) filter (where server_meta is true)::text as meta_server,
         count(*) filter (
           where server_meta is true and coalesce(web_meta, false) = false
         )::text as meta_server_only,
         count(*) filter (where web_ga4 is true)::text as ga4_web,
         count(*) filter (where server_ga4 is true)::text as ga4_server,
         count(*) filter (
           where server_ga4 is true and coalesce(web_ga4, false) = false
         )::text as ga4_server_only
       from events_log
       where created_at >= now() - $1::interval`,
      [interval]
    ),
  ]);

  const total = Number(totalsRes?.total ?? 0);
  const webServer = Number(totalsRes?.web_server ?? 0);
  const serverOnly = Number(totalsRes?.server_only ?? 0);
  const webOnly = Number(totalsRes?.web_only ?? 0);
  const unknown = Number(totalsRes?.unknown ?? 0);

  const metaWeb = Number(destRes?.meta_web ?? 0);
  const metaServer = Number(destRes?.meta_server ?? 0);
  const metaServerOnly = Number(destRes?.meta_server_only ?? 0);
  const ga4Web = Number(destRes?.ga4_web ?? 0);
  const ga4Server = Number(destRes?.ga4_server ?? 0);
  const ga4ServerOnly = Number(destRes?.ga4_server_only ?? 0);

  const metaDenom = metaWeb + metaServerOnly;
  const ga4Denom = ga4Web + ga4ServerOnly;

  return {
    range,
    total,
    webServer,
    serverOnly,
    webOnly,
    unknown,
    lossWithoutPlatformCount: serverOnly,
    lossWithoutPlatformPct: pct(serverOnly, total),
    serverCoveragePct: pct(webServer + serverOnly, total),
    byEvent: byEventRes.rows.map((r) => ({
      name: r.event_name,
      total: Number(r.total),
      webServer: Number(r.web_server),
      serverOnly: Number(r.server_only),
      webOnly: Number(r.web_only),
    })),
    byDestination: {
      meta: {
        web: metaWeb,
        server: metaServer,
        serverOnlyPct: pct(metaServerOnly, metaDenom || metaServer),
      },
      ga4: {
        web: ga4Web,
        server: ga4Server,
        serverOnlyPct: pct(ga4ServerOnly, ga4Denom || ga4Server),
      },
    },
  };
}
