import "server-only";

import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { listConnections } from "@/lib/integrations/connections";
import {
  sendToConnection,
  type OutboundEventInput,
  type OutboundResult,
} from "@/lib/integrations/outbound";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";

export async function dispatchMapped(opts: {
  eventId: string;
  metaEventName: string | null;
  ga4EventName: string | null;
  userData: OutboundEventInput["userData"];
  customData?: OutboundEventInput["customData"];
  gaClientId?: string | null;
  gaClientIdSource?: OutboundEventInput["gaClientIdSource"];
  gaIdentityMeta?: OutboundEventInput["gaIdentityMeta"];
  gaSessionId?: string | null;
  eventSourceUrl?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  transactionId?: string | null;
  gaUserId?: string | null;
}): Promise<OutboundResult[]> {
  const results: OutboundResult[] = [];
  const base: Omit<OutboundEventInput, "eventName"> = {
    eventId: opts.eventId,
    eventSourceUrl: opts.eventSourceUrl,
    userData: opts.userData,
    customData: opts.customData,
    gaClientId: opts.gaClientId,
    gaClientIdSource: opts.gaClientIdSource,
    gaIdentityMeta: opts.gaIdentityMeta,
    gaSessionId: opts.gaSessionId,
    gclid: opts.gclid,
    wbraid: opts.wbraid,
    gbraid: opts.gbraid,
    transactionId: opts.transactionId,
    gaUserId: opts.gaUserId,
  };
  if (opts.metaEventName) {
    const metas = await listConnections({
      provider: "meta_pixel",
      activeOnly: true,
    });
    for (const dest of metas) {
      results.push(
        await sendToConnection(dest, {
          ...base,
          eventName: opts.metaEventName,
        })
      );
    }
  }
  if (opts.ga4EventName) {
    const ga4s = await listConnections({
      provider: "ga4",
      activeOnly: true,
    });
    for (const dest of ga4s) {
      results.push(
        await sendToConnection(dest, {
          ...base,
          eventName: opts.ga4EventName,
        })
      );
    }
  }
  const adsEventName = opts.metaEventName || opts.ga4EventName;
  if (adsEventName) {
    const ads = await listConnections({
      provider: "google_ads",
      activeOnly: true,
    });
    for (const dest of ads) {
      results.push(
        await sendToConnection(dest, {
          ...base,
          eventName: adsEventName,
        })
      );
    }
  }
  return results;
}

export async function persistEventLog(opts: {
  trckUserId: string | null;
  eventName: string;
  eventId: string;
  visitor: VisitorRow | null;
  results: OutboundResult[];
  ingestPath: string;
  replaceExisting?: boolean;
}): Promise<"inserted" | "deduped"> {
  const metaResults = opts.results.filter((r) => r.provider === "meta_pixel");
  const ga4Results = opts.results.filter((r) => r.provider === "ga4");
  const { serverMeta, serverGa4 } = serverFlagsFromDispatch(opts.results);
  const channelClass = classifyChannel({
    webMeta: false,
    webGa4: false,
    serverMeta,
    serverGa4,
  });
  const conflictSql = opts.replaceExisting
    ? `on conflict (event_id) do update set
         trck_user_id = coalesce(excluded.trck_user_id, events_log.trck_user_id),
         payload_meta = excluded.payload_meta,
         response_meta = excluded.response_meta,
         payload_ga4 = excluded.payload_ga4,
         response_ga4 = excluded.response_ga4,
         server_meta = excluded.server_meta,
         server_ga4 = excluded.server_ga4,
         channel_class = excluded.channel_class,
         ingest_path = excluded.ingest_path`
    : `on conflict (event_id) do nothing`;

  const inserted = await queryOne<{ id: string }>(
    `insert into events_log (
       trck_user_id, event_name, event_id,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       payload_meta, response_meta, payload_ga4, response_ga4,
       ip, geo_country, geo_region, geo_city,
       ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,
       $17, false, false, $18, $19, $20
     )
     ${conflictSql}
     returning id`,
    [
      opts.trckUserId,
      opts.eventName,
      opts.eventId,
      opts.visitor?.utm_source ?? null,
      opts.visitor?.utm_medium ?? null,
      opts.visitor?.utm_campaign ?? null,
      opts.visitor?.utm_term ?? null,
      opts.visitor?.utm_content ?? null,
      JSON.stringify(metaResults.map((r) => r.payload)),
      JSON.stringify(metaResults),
      JSON.stringify(ga4Results.map((r) => r.payload)),
      JSON.stringify(ga4Results),
      opts.visitor?.ip ?? null,
      opts.visitor?.geo_country ?? null,
      opts.visitor?.geo_region ?? null,
      opts.visitor?.geo_city ?? null,
      opts.ingestPath,
      serverMeta,
      serverGa4,
      channelClass,
    ]
  );
  return inserted ? "inserted" : "deduped";
}
