import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { listConnections } from "@/lib/integrations/connections";
import {
  sendToConnection,
  type OutboundResult,
} from "@/lib/integrations/outbound";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import type {
  GaClientIdSource,
  GaIdentityMeta,
} from "@/lib/tracking/ga-client-id";
import { resolveConversionAttribution } from "@/lib/tracking/attribution";
import { hashEmail, hashPhone, hashPii, sha256 } from "@/lib/tracking/hash";
import { matchAndMergeVisitor } from "@/lib/tracking/match";
import { resolveAndPersistGaClientId } from "@/lib/tracking/persist-ga-client-id";
import {
  extractContactEmailPhone,
  getCrmContact,
  getCrmDeal,
} from "@/lib/rd/crm";
import {
  extractMktContact,
  inferMktLifecycle,
  type MktLifecycleKey,
} from "@/lib/rd/mkt";

export type ProcessRdResult =
  | {
      ok: true;
      deduped?: boolean;
      event_id?: string;
      match?: { status: string; reason: string };
      skipped?: string;
    }
  | { ok: false; error: string; status: number };

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export type CrmDealStatus = "won" | "lost";

function isCrmDealStatus(v: unknown): v is CrmDealStatus {
  return v === "won" || v === "lost";
}

/** Deterministic id: once per deal + pipeline + stage. */
function crmEventId(
  dealId: string,
  pipelineId: string,
  stageId: string
): string {
  return sha256(`rdcrm:deal:${dealId}:pipe:${pipelineId}:stage:${stageId}`);
}

function crmStatusEventId(dealId: string, status: CrmDealStatus): string {
  return sha256(`rdcrm:deal:${dealId}:status:${status}`);
}

function mktEventId(dealKey: string, lifecycle: string): string {
  return sha256(`rdmkt:${dealKey}:lifecycle:${lifecycle}`);
}

/**
 * Atomic claim: first webhook for (deal, pipe, stage) wins.
 * Concurrent RD retries for the same stage get deduped.
 */
async function claimDealStageEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  pipelineExternalId: string;
  stageExternalId: string;
  eventId: string;
}): Promise<"claimed" | "already_emitted"> {
  const row = await queryOne<{ id: string }>(
    `insert into rd_deal_stage_emits (
       connection_id, deal_external_id, pipeline_external_id, stage_external_id, event_id
     ) values ($1,$2,$3,$4,$5)
     on conflict (connection_id, deal_external_id, pipeline_external_id, stage_external_id)
     do nothing
     returning id`,
    [
      opts.connectionId,
      opts.dealExternalId,
      opts.pipelineExternalId,
      opts.stageExternalId,
      opts.eventId,
    ]
  );
  return row ? "claimed" : "already_emitted";
}

async function claimDealStatusEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  dealStatus: CrmDealStatus;
  eventId: string;
}): Promise<"claimed" | "already_emitted"> {
  const row = await queryOne<{ id: string }>(
    `insert into rd_deal_status_emits (
       connection_id, deal_external_id, deal_status, event_id
     ) values ($1,$2,$3,$4)
     on conflict (connection_id, deal_external_id, deal_status)
     do nothing
     returning id`,
    [
      opts.connectionId,
      opts.dealExternalId,
      opts.dealStatus,
      opts.eventId,
    ]
  );
  return row ? "claimed" : "already_emitted";
}

async function loadStageMap(
  connectionId: string,
  opts: {
    stageExternalId?: string;
    mktLifecycle?: string;
    dealStatus?: CrmDealStatus;
  }
): Promise<{ meta_event_name: string | null; ga4_event_name: string | null } | null> {
  if (opts.stageExternalId) {
    return queryOne(
      `select meta_event_name, ga4_event_name from rd_stage_event_maps
       where connection_id = $1 and stage_external_id = $2 limit 1`,
      [connectionId, opts.stageExternalId]
    );
  }
  if (opts.mktLifecycle) {
    return queryOne(
      `select meta_event_name, ga4_event_name from rd_stage_event_maps
       where connection_id = $1 and mkt_lifecycle = $2 limit 1`,
      [connectionId, opts.mktLifecycle]
    );
  }
  if (opts.dealStatus) {
    return queryOne(
      `select meta_event_name, ga4_event_name from rd_stage_event_maps
       where connection_id = $1 and deal_status = $2 limit 1`,
      [connectionId, opts.dealStatus]
    );
  }
  return null;
}

async function dispatchMapped(opts: {
  eventId: string;
  metaEventName: string | null;
  ga4EventName: string | null;
  userData: Parameters<typeof sendToConnection>[1]["userData"];
  customData?: Parameters<typeof sendToConnection>[1]["customData"];
  gaClientId?: string | null;
  gaClientIdSource?: GaClientIdSource | null;
  gaIdentityMeta?: GaIdentityMeta | null;
  gaSessionId?: string | null;
  eventSourceUrl?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
}): Promise<OutboundResult[]> {
  const results: OutboundResult[] = [];
  if (opts.metaEventName) {
    const metas = await listConnections({
      provider: "meta_pixel",
      activeOnly: true,
    });
    for (const dest of metas) {
      results.push(
        await sendToConnection(dest, {
          eventId: opts.eventId,
          eventName: opts.metaEventName,
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
          eventId: opts.eventId,
          eventName: opts.ga4EventName,
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
          eventId: opts.eventId,
          eventName: adsEventName,
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
        })
      );
    }
  }
  return results;
}

async function persistEventLog(opts: {
  trckUserId: string | null;
  eventName: string;
  eventId: string;
  visitor: Awaited<ReturnType<typeof matchAndMergeVisitor>>["visitor"];
  results: OutboundResult[];
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

  const inserted = await queryOne<{ id: string }>(
    `insert into events_log (
       trck_user_id, event_name, event_id,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       payload_meta, response_meta, payload_ga4, response_ga4,
       ip, geo_country, geo_region, geo_city,
       ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,
       'webhook', false, false, $17, $18, $19
     )
     on conflict (event_id) do nothing
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
      serverMeta,
      serverGa4,
      channelClass,
    ]
  );
  return inserted ? "inserted" : "deduped";
}

export async function processRdWebhook(opts: {
  conn: IntegrationConnectionRow;
  raw: unknown;
}): Promise<ProcessRdResult> {
  await ensureDbReady();
  const { conn, raw } = opts;

  if (conn.provider === "rdstation_crm") {
    return processCrmDealWebhook(conn, raw);
  }
  if (conn.provider === "rdstation_mkt") {
    return processMktWebhook(conn, raw);
  }
  return { ok: false, error: "unsupported_provider", status: 400 };
}

async function processCrmDealWebhook(
  conn: IntegrationConnectionRow,
  raw: unknown
): Promise<ProcessRdResult> {
  const root = asRecord(raw);
  if (!root) {
    return { ok: false, error: "invalid_payload", status: 400 };
  }

  const document =
    asRecord(root.document) ||
    asRecord(root.data) ||
    asRecord(root.deal) ||
    root;

  let dealId =
    (typeof document.id === "string" && document.id) ||
    (typeof document.deal_id === "string" && document.deal_id) ||
    null;
  let stageId =
    (typeof document.stage_id === "string" && document.stage_id) ||
    (typeof document.deal_stage_id === "string" && document.deal_stage_id) ||
    null;
  let pipelineId =
    (typeof document.pipeline_id === "string" && document.pipeline_id) ||
    (typeof document.deal_pipeline_id === "string" &&
      document.deal_pipeline_id) ||
    null;
  let dealStatus: CrmDealStatus | null = isCrmDealStatus(document.status)
    ? document.status
    : null;

  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;
  let value: number | undefined;

  if (typeof document.total_price === "number") value = document.total_price;
  else if (typeof document.one_time_price === "number") {
    value = document.one_time_price;
  }

  let contactIds = Array.isArray(document.contact_ids)
    ? document.contact_ids.filter((x): x is string => typeof x === "string")
    : [];

  const needsDealFetch =
    Boolean(dealId) &&
    (!email || !stageId || !pipelineId || !dealStatus || contactIds.length === 0);

  if (needsDealFetch && dealId) {
    const deal = await getCrmDeal(conn, dealId);
    if (deal) {
      dealId = typeof deal.id === "string" ? deal.id : dealId;
      stageId =
        (typeof deal.stage_id === "string" && deal.stage_id) || stageId;
      pipelineId =
        (typeof deal.pipeline_id === "string" && deal.pipeline_id) ||
        pipelineId;
      if (!dealStatus && isCrmDealStatus(deal.status)) {
        dealStatus = deal.status;
      }
      if (typeof deal.total_price === "number") value = deal.total_price;
      else if (typeof deal.one_time_price === "number") {
        value = deal.one_time_price;
      }
      const ids = Array.isArray(deal.contact_ids)
        ? deal.contact_ids.filter((x): x is string => typeof x === "string")
        : contactIds;
      if (ids.length) contactIds = ids;
      if (ids[0] && !email) {
        const contact = await getCrmContact(conn, ids[0]);
        if (contact) {
          const extracted = extractContactEmailPhone(contact);
          email = extracted.email;
          phone = extracted.phone;
          name = extracted.name;
        }
      }
    }
  }

  if (!email && contactIds[0]) {
    const contact = await getCrmContact(conn, contactIds[0]);
    if (contact) {
      const extracted = extractContactEmailPhone(contact);
      email = extracted.email;
      phone = extracted.phone;
      name = extracted.name;
    }
  }

  if (!dealId) {
    return { ok: false, error: "missing_deal", status: 400 };
  }
  if (!stageId && !dealStatus) {
    return { ok: false, error: "missing_deal_or_stage", status: 400 };
  }

  const match = await matchAndMergeVisitor({ email, phone });
  const visitor = match.visitor;
  const attr = resolveConversionAttribution(visitor);
  const trckUserId = visitor?.trck_user_id ?? null;
  const gaResolved = await resolveAndPersistGaClientId({
    stored: visitor?.ga_client_id,
    storedSource: visitor?.ga_client_id_source,
    storedBrowserGa: visitor?.browser_ga_client_id,
    trckUserId,
    visitorCreatedAt: visitor?.created_at,
  });
  const userData: Parameters<typeof sendToConnection>[1]["userData"] = {
    email: email ?? visitor?.email,
    emailHash: hashEmail(email) ?? visitor?.email_hash,
    phoneHash: hashPhone(phone) ?? visitor?.phone_hash,
    firstNameHash: hashPii(name?.split(/\s+/)[0]) ?? visitor?.first_name_hash,
    lastNameHash:
      hashPii(name?.split(/\s+/).slice(1).join(" ")) ??
      visitor?.last_name_hash,
    cityHash: visitor?.city_hash,
    stateHash: visitor?.state_hash,
    countryHash: visitor?.country_hash,
    externalId: trckUserId,
    externalIdHash:
      visitor?.external_id_hash ?? (trckUserId ? hashPii(trckUserId) : null),
    fbp: attr.fbp,
    fbc: attr.fbc,
    ctwaClid: attr.ctwa_clid,
    clientIpAddress: visitor?.ip,
    clientUserAgent: visitor?.user_agent,
  };

  let stageEventId: string | undefined;
  let stageDeduped = false;
  let stageSkipped: string | undefined;

  if (stageId) {
    const pipeKey = pipelineId || "";
    const map = await loadStageMap(conn.id, { stageExternalId: stageId });
    if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
      stageSkipped = "no_stage_map";
    } else {
      stageEventId = crmEventId(dealId, pipeKey, stageId);
      const claim = await claimDealStageEmit({
        connectionId: conn.id,
        dealExternalId: dealId,
        pipelineExternalId: pipeKey,
        stageExternalId: stageId,
        eventId: stageEventId,
      });
      if (claim === "already_emitted") {
        stageDeduped = true;
      } else {
        const eventName = map.meta_event_name || map.ga4_event_name || "Lead";
        const results = await dispatchMapped({
          eventId: stageEventId,
          metaEventName: map.meta_event_name,
          ga4EventName: map.ga4_event_name,
          eventSourceUrl: null,
          userData,
          customData:
            value != null
              ? { value, currency: "BRL", content_type: "product" }
              : undefined,
          gaClientId: gaResolved.clientId,
          gaClientIdSource: gaResolved.source,
          gaIdentityMeta: gaResolved.meta,
          gaSessionId: visitor?.ga_session_id,
          gclid: attr.gclid,
          wbraid: attr.wbraid,
          gbraid: attr.gbraid,
        });
        await persistEventLog({
          trckUserId,
          eventName,
          eventId: stageEventId,
          visitor,
          results,
        });
      }
    }
  }

  let statusEventId: string | undefined;
  let statusDeduped = false;
  let statusSkipped: string | undefined;

  if (dealStatus) {
    const statusMap = await loadStageMap(conn.id, { dealStatus });
    if (!statusMap || (!statusMap.meta_event_name && !statusMap.ga4_event_name)) {
      statusSkipped = "no_status_map";
    } else {
      statusEventId = crmStatusEventId(dealId, dealStatus);
      const claim = await claimDealStatusEmit({
        connectionId: conn.id,
        dealExternalId: dealId,
        dealStatus,
        eventId: statusEventId,
      });
      if (claim === "already_emitted") {
        statusDeduped = true;
      } else {
        const eventName =
          statusMap.meta_event_name || statusMap.ga4_event_name || "Lead";
        const includeValue = dealStatus === "won" && value != null;
        const results = await dispatchMapped({
          eventId: statusEventId,
          metaEventName: statusMap.meta_event_name,
          ga4EventName: statusMap.ga4_event_name,
          eventSourceUrl: null,
          userData,
          customData: includeValue
            ? { value, currency: "BRL", content_type: "product" }
            : undefined,
          gaClientId: gaResolved.clientId,
          gaClientIdSource: gaResolved.source,
          gaIdentityMeta: gaResolved.meta,
          gaSessionId: visitor?.ga_session_id,
          gclid: attr.gclid,
          wbraid: attr.wbraid,
          gbraid: attr.gbraid,
        });
        await persistEventLog({
          trckUserId,
          eventName,
          eventId: statusEventId,
          visitor,
          results,
        });
      }
    }
  }

  await upsertDealState(
    conn.id,
    dealId,
    stageId || `status:${dealStatus ?? "unknown"}`,
    hashEmail(email),
    dealStatus
  );

  if (
    stageSkipped &&
    !stageEventId &&
    (statusSkipped || !dealStatus) &&
    !statusEventId
  ) {
    return {
      ok: true,
      skipped: stageSkipped || statusSkipped || "no_map",
    };
  }

  return {
    ok: true,
    event_id: stageEventId ?? statusEventId,
    deduped:
      (stageDeduped || !stageEventId) &&
      (statusDeduped || !statusEventId) &&
      Boolean(stageEventId || statusEventId),
    match: { status: match.match_status, reason: match.match_reason },
  };
}

async function processMktWebhook(
  conn: IntegrationConnectionRow,
  raw: unknown
): Promise<ProcessRdResult> {
  const root = asRecord(raw);
  if (!root) {
    return { ok: false, error: "invalid_payload", status: 400 };
  }

  const eventType =
    (typeof root.event_type === "string" && root.event_type) ||
    (typeof root.event_name === "string" && root.event_name) ||
    null;

  const lifecycle: MktLifecycleKey = inferMktLifecycle(eventType, root);
  const contact = extractMktContact(root);
  if (!contact.dealId) {
    return { ok: false, error: "missing_contact_key", status: 400 };
  }

  const stageKey = `mkt:${lifecycle}`;

  const map = await loadStageMap(conn.id, { mktLifecycle: lifecycle });
  if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
    await upsertDealState(
      conn.id,
      contact.dealId,
      stageKey,
      hashEmail(contact.email)
    );
    return { ok: true, skipped: "no_lifecycle_map" };
  }

  const eventId = mktEventId(contact.dealId, lifecycle);
  const claim = await claimDealStageEmit({
    connectionId: conn.id,
    dealExternalId: contact.dealId,
    pipelineExternalId: "mkt",
    stageExternalId: stageKey,
    eventId,
  });
  if (claim === "already_emitted") {
    await upsertDealState(
      conn.id,
      contact.dealId,
      stageKey,
      hashEmail(contact.email)
    );
    return { ok: true, deduped: true, event_id: eventId };
  }

  const match = await matchAndMergeVisitor({
    email: contact.email,
    phone: contact.phone,
  });
  const visitor = match.visitor;
  const attr = resolveConversionAttribution(visitor);
  const trckUserId = visitor?.trck_user_id ?? null;
  const gaResolved = await resolveAndPersistGaClientId({
    stored: visitor?.ga_client_id,
    storedSource: visitor?.ga_client_id_source,
    storedBrowserGa: visitor?.browser_ga_client_id,
    trckUserId,
    visitorCreatedAt: visitor?.created_at,
  });
  const eventName = map.meta_event_name || map.ga4_event_name || "Lead";

  const results = await dispatchMapped({
    eventId,
    metaEventName: map.meta_event_name,
    ga4EventName: map.ga4_event_name,
    userData: {
      email: contact.email ?? visitor?.email,
      emailHash: hashEmail(contact.email) ?? visitor?.email_hash,
      phoneHash: hashPhone(contact.phone) ?? visitor?.phone_hash,
      firstNameHash:
        hashPii(contact.name?.split(/\s+/)[0]) ?? visitor?.first_name_hash,
      lastNameHash:
        hashPii(contact.name?.split(/\s+/).slice(1).join(" ")) ??
        visitor?.last_name_hash,
      cityHash: visitor?.city_hash,
      stateHash: visitor?.state_hash,
      countryHash: visitor?.country_hash,
      externalId: trckUserId,
      externalIdHash:
        visitor?.external_id_hash ?? (trckUserId ? hashPii(trckUserId) : null),
      fbp: attr.fbp,
      fbc: attr.fbc,
      ctwaClid: attr.ctwa_clid,
      clientIpAddress: visitor?.ip,
      clientUserAgent: visitor?.user_agent,
    },
    gaClientId: gaResolved.clientId,
    gaClientIdSource: gaResolved.source,
    gaIdentityMeta: gaResolved.meta,
    gaSessionId: visitor?.ga_session_id,
    gclid: attr.gclid,
    wbraid: attr.wbraid,
    gbraid: attr.gbraid,
  });

  await persistEventLog({
    trckUserId,
    eventName,
    eventId,
    visitor,
    results,
  });
  await upsertDealState(
    conn.id,
    contact.dealId,
    stageKey,
    hashEmail(contact.email)
  );

  return {
    ok: true,
    event_id: eventId,
    match: { status: match.match_status, reason: match.match_reason },
  };
}

async function upsertDealState(
  connectionId: string,
  dealExternalId: string,
  lastStageExternalId: string,
  contactEmailHash: string | null,
  lastStatus?: CrmDealStatus | null
): Promise<void> {
  await query(
    `insert into rd_deal_state (
       connection_id, deal_external_id, last_stage_external_id, contact_email_hash, last_status, updated_at
     ) values ($1,$2,$3,$4,$5, now())
     on conflict (connection_id, deal_external_id) do update set
       last_stage_external_id = excluded.last_stage_external_id,
       contact_email_hash = coalesce(excluded.contact_email_hash, rd_deal_state.contact_email_hash),
       last_status = coalesce(excluded.last_status, rd_deal_state.last_status),
       updated_at = now()`,
    [
      connectionId,
      dealExternalId,
      lastStageExternalId,
      contactEmailHash,
      lastStatus ?? null,
    ]
  );
}
