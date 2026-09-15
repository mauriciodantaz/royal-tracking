import "server-only";

import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import type {
  OutboundEventInput,
  OutboundResult,
} from "@/lib/integrations/outbound";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import { getCustomEventById } from "@/lib/tracking/custom-events";

export type CrmStageMap = {
  meta_event_name: string | null;
  ga4_event_name: string | null;
  custom_event_id?: string | null;
};

export function crmMapHasDest(map: CrmStageMap | null): map is CrmStageMap {
  if (!map) return false;
  return Boolean(
    map.custom_event_id || map.meta_event_name || map.ga4_event_name
  );
}

export async function dispatchCrmEvent(opts: {
  sourceProvider: string;
  sourceConnectionId: string;
  map: CrmStageMap;
  eventId: string;
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
}): Promise<{ results: OutboundResult[]; eventName: string }> {
  let sourceEvent =
    opts.map.meta_event_name || opts.map.ga4_event_name || "Lead";
  let destOverrides: { meta?: string | null; ga4?: string | null } | undefined =
    {
      meta: opts.map.meta_event_name,
      ga4: opts.map.ga4_event_name,
    };

  if (opts.map.custom_event_id) {
    const catalog = await getCustomEventById(opts.map.custom_event_id);
    if (catalog?.active) {
      sourceEvent = catalog.slug;
      destOverrides = undefined;
    }
  }

  const dispatch = await dispatchEvent({
    sourceProvider: opts.sourceProvider,
    sourceConnectionId: opts.sourceConnectionId,
    sourceEvent,
    destOverrides,
    includeGoogleAds: true,
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
  });

  return {
    results: dispatch.results,
    eventName: dispatch.resolvedEventName,
  };
}

/** Wrapper legado: mesmo motor central, com override Meta/GA4 + Ads. */
export async function dispatchMapped(opts: {
  eventId: string;
  metaEventName: string | null;
  ga4EventName: string | null;
  sourceProvider?: string;
  sourceConnectionId?: string;
  customEventId?: string | null;
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
  const { results } = await dispatchCrmEvent({
    sourceProvider: opts.sourceProvider ?? "crm",
    sourceConnectionId: opts.sourceConnectionId ?? "",
    map: {
      meta_event_name: opts.metaEventName,
      ga4_event_name: opts.ga4EventName,
      custom_event_id: opts.customEventId,
    },
    eventId: opts.eventId,
    userData: opts.userData,
    customData: opts.customData,
    gaClientId: opts.gaClientId,
    gaClientIdSource: opts.gaClientIdSource,
    gaIdentityMeta: opts.gaIdentityMeta,
    gaSessionId: opts.gaSessionId,
    eventSourceUrl: opts.eventSourceUrl,
    gclid: opts.gclid,
    wbraid: opts.wbraid,
    gbraid: opts.gbraid,
    transactionId: opts.transactionId,
    gaUserId: opts.gaUserId,
  });
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
