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
  extractPersonEmailPhone,
  getDeal,
  getPerson,
} from "@/lib/pipedrive/api";
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

export type ProcessPipedriveResult =
  | {
      ok: true;
      deduped?: boolean;
      event_id?: string;
      match?: { status: string; reason: string };
      skipped?: string;
    }
  | { ok: false; error: string; status: number };

export type DealStatus = "won" | "lost";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function isDealStatus(v: unknown): v is DealStatus {
  return v === "won" || v === "lost";
}

function idStr(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function stageEventId(
  dealId: string,
  pipelineId: string,
  stageId: string
): string {
  return sha256(
    `pipedrive:deal:${dealId}:pipe:${pipelineId}:stage:${stageId}`
  );
}

function statusEventId(dealId: string, status: DealStatus): string {
  return sha256(`pipedrive:deal:${dealId}:status:${status}`);
}

async function claimDealStageEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  pipelineExternalId: string;
  stageExternalId: string;
  eventId: string;
}): Promise<"claimed" | "already_emitted"> {
  const row = await queryOne<{ id: string }>(
    `insert into pipedrive_deal_stage_emits (
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
  dealStatus: DealStatus;
  eventId: string;
}): Promise<"claimed" | "already_emitted"> {
  const row = await queryOne<{ id: string }>(
    `insert into pipedrive_deal_status_emits (
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

async function releaseDealStageEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  pipelineExternalId: string;
  stageExternalId: string;
}): Promise<void> {
  await query(
    `delete from pipedrive_deal_stage_emits
     where connection_id = $1
       and deal_external_id = $2
       and pipeline_external_id = $3
       and stage_external_id = $4`,
    [
      opts.connectionId,
      opts.dealExternalId,
      opts.pipelineExternalId,
      opts.stageExternalId,
    ]
  );
}

async function releaseDealStatusEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  dealStatus: DealStatus;
}): Promise<void> {
  await query(
    `delete from pipedrive_deal_status_emits
     where connection_id = $1
       and deal_external_id = $2
       and deal_status = $3`,
    [opts.connectionId, opts.dealExternalId, opts.dealStatus]
  );
}

async function stageAlreadyEmitted(opts: {
  connectionId: string;
  dealExternalId: string;
  pipelineExternalId: string;
  stageExternalId: string;
}): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from pipedrive_deal_stage_emits
     where connection_id = $1
       and deal_external_id = $2
       and pipeline_external_id = $3
       and stage_external_id = $4
     limit 1`,
    [
      opts.connectionId,
      opts.dealExternalId,
      opts.pipelineExternalId,
      opts.stageExternalId,
    ]
  );
  return Boolean(row);
}

async function statusAlreadyEmitted(opts: {
  connectionId: string;
  dealExternalId: string;
  dealStatus: DealStatus;
}): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from pipedrive_deal_status_emits
     where connection_id = $1
       and deal_external_id = $2
       and deal_status = $3
     limit 1`,
    [opts.connectionId, opts.dealExternalId, opts.dealStatus]
  );
  return Boolean(row);
}

async function isPipelineEnabled(
  connectionId: string,
  pipelineExternalId: string
): Promise<boolean> {
  if (!pipelineExternalId) return true;
  const row = await queryOne<{ enabled: boolean }>(
    `select enabled from pipedrive_pipelines
     where connection_id = $1 and external_id = $2 limit 1`,
    [connectionId, pipelineExternalId]
  );
  if (!row) return true;
  return row.enabled !== false;
}

async function loadStageMap(
  connectionId: string,
  opts: { stageExternalId?: string; dealStatus?: DealStatus }
): Promise<{
  meta_event_name: string | null;
  ga4_event_name: string | null;
} | null> {
  if (opts.stageExternalId) {
    return queryOne(
      `select meta_event_name, ga4_event_name from pipedrive_stage_event_maps
       where connection_id = $1 and stage_external_id = $2 limit 1`,
      [connectionId, opts.stageExternalId]
    );
  }
  if (opts.dealStatus) {
    return queryOne(
      `select meta_event_name, ga4_event_name from pipedrive_stage_event_maps
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

async function upsertDealState(
  connectionId: string,
  dealExternalId: string,
  lastStageExternalId: string,
  contactEmailHash: string | null,
  lastStatus?: DealStatus | null
): Promise<void> {
  await query(
    `insert into pipedrive_deal_state (
       connection_id, deal_external_id, last_stage_external_id, contact_email_hash, last_status, updated_at
     ) values ($1,$2,$3,$4,$5, now())
     on conflict (connection_id, deal_external_id) do update set
       last_stage_external_id = excluded.last_stage_external_id,
       contact_email_hash = coalesce(excluded.contact_email_hash, pipedrive_deal_state.contact_email_hash),
       last_status = coalesce(excluded.last_status, pipedrive_deal_state.last_status),
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

export async function processPipedriveWebhook(opts: {
  conn: IntegrationConnectionRow;
  raw: unknown;
}): Promise<ProcessPipedriveResult> {
  await ensureDbReady();
  const { conn, raw } = opts;

  if (conn.provider !== "pipedrive") {
    return { ok: false, error: "unsupported_provider", status: 400 };
  }

  const root = asRecord(raw);
  if (!root) {
    return { ok: false, error: "invalid_payload", status: 400 };
  }

  const meta = asRecord(root.meta);
  const data = asRecord(root.data) || asRecord(root.current) || root;
  const previous = asRecord(root.previous);

  const action =
    (typeof meta?.action === "string" && meta.action) ||
    (typeof root.event === "string" && root.event) ||
    null;
  const entity =
    (typeof meta?.entity === "string" && meta.entity) ||
    (typeof meta?.object === "string" && meta.object) ||
    null;

  if (entity && entity !== "deal") {
    return { ok: true, skipped: "not_deal" };
  }
  if (action === "delete") {
    return { ok: true, skipped: "deal_deleted" };
  }

  let dealId =
    idStr(data.id) ||
    idStr(meta?.entity_id) ||
    idStr(root.deal_id) ||
    null;
  let stageId = idStr(data.stage_id);
  let pipelineId = idStr(data.pipeline_id);
  let personId = idStr(data.person_id);
  let dealStatus: DealStatus | null = isDealStatus(data.status)
    ? data.status
    : null;

  const prevStageId = previous ? idStr(previous.stage_id) : null;
  const prevStatus = previous && isDealStatus(previous.status)
    ? previous.status
    : null;

  if (!dealId) {
    return { ok: false, error: "missing_deal", status: 400 };
  }

  const stageChanged =
    action === "create" ||
    !prevStageId ||
    (Boolean(stageId) && stageId !== prevStageId);
  const statusBecameTerminal =
    Boolean(dealStatus) &&
    (action === "create" || !prevStatus || prevStatus !== dealStatus);

  // change.deal without stage/status transition — discard without API.
  if (
    action === "change" &&
    !stageChanged &&
    !statusBecameTerminal
  ) {
    return { ok: true, skipped: "no_stage_or_status_change" };
  }

  if (!stageId && !dealStatus) {
    return { ok: false, error: "missing_deal_or_stage", status: 400 };
  }

  const pipeKey = pipelineId || "";

  let needStageEmit = false;
  let needStatusEmit = false;
  let stageMap: {
    meta_event_name: string | null;
    ga4_event_name: string | null;
  } | null = null;
  let statusMap: {
    meta_event_name: string | null;
    ga4_event_name: string | null;
  } | null = null;

  if (stageId && stageChanged) {
    if (!(await isPipelineEnabled(conn.id, pipeKey))) {
      stageMap = null;
    } else {
      stageMap = await loadStageMap(conn.id, { stageExternalId: stageId });
      if (stageMap && (stageMap.meta_event_name || stageMap.ga4_event_name)) {
        const already = await stageAlreadyEmitted({
          connectionId: conn.id,
          dealExternalId: dealId,
          pipelineExternalId: pipeKey,
          stageExternalId: stageId,
        });
        if (!already) needStageEmit = true;
      }
    }
  }

  if (dealStatus && statusBecameTerminal) {
    statusMap = await loadStageMap(conn.id, { dealStatus });
    if (statusMap && (statusMap.meta_event_name || statusMap.ga4_event_name)) {
      const already = await statusAlreadyEmitted({
        connectionId: conn.id,
        dealExternalId: dealId,
        dealStatus,
      });
      if (!already) needStatusEmit = true;
    }
  }

  if (!needStageEmit && !needStatusEmit) {
    const skipped =
      (stageId && stageChanged && (!stageMap || (!stageMap.meta_event_name && !stageMap.ga4_event_name))
        ? "no_stage_map"
        : null) ||
      (dealStatus && statusBecameTerminal && (!statusMap || (!statusMap.meta_event_name && !statusMap.ga4_event_name))
        ? "no_status_map"
        : null) ||
      "already_emitted";
    return {
      ok: true,
      deduped: skipped === "already_emitted",
      skipped,
    };
  }

  // Claim before enrich so concurrent webhooks don't both hit Pipedrive API.
  let stageEventIdValue: string | undefined;
  let stageClaimed = false;
  if (needStageEmit && stageId && stageMap) {
    stageEventIdValue = stageEventId(dealId, pipeKey, stageId);
    const claim = await claimDealStageEmit({
      connectionId: conn.id,
      dealExternalId: dealId,
      pipelineExternalId: pipeKey,
      stageExternalId: stageId,
      eventId: stageEventIdValue,
    });
    stageClaimed = claim === "claimed";
    if (!stageClaimed) stageEventIdValue = undefined;
  }

  let statusEventIdValue: string | undefined;
  let statusClaimed = false;
  if (needStatusEmit && dealStatus && statusMap) {
    statusEventIdValue = statusEventId(dealId, dealStatus);
    const claim = await claimDealStatusEmit({
      connectionId: conn.id,
      dealExternalId: dealId,
      dealStatus,
      eventId: statusEventIdValue,
    });
    statusClaimed = claim === "claimed";
    if (!statusClaimed) statusEventIdValue = undefined;
  }

  if (!stageClaimed && !statusClaimed) {
    return { ok: true, deduped: true };
  }

  try {
    return await emitPipedriveAfterClaim({
      conn,
      dealId,
      pipeKey,
      stageId,
      dealStatus,
      data,
      stageClaimed,
      statusClaimed,
      stageEventIdValue,
      statusEventIdValue,
      stageMap,
      statusMap,
    });
  } catch (err) {
    if (stageClaimed && stageId) {
      await releaseDealStageEmit({
        connectionId: conn.id,
        dealExternalId: dealId,
        pipelineExternalId: pipeKey,
        stageExternalId: stageId,
      });
    }
    if (statusClaimed && dealStatus) {
      await releaseDealStatusEmit({
        connectionId: conn.id,
        dealExternalId: dealId,
        dealStatus,
      });
    }
    throw err;
  }
}

async function emitPipedriveAfterClaim(opts: {
  conn: IntegrationConnectionRow;
  dealId: string;
  pipeKey: string;
  stageId: string | null;
  dealStatus: DealStatus | null;
  data: Record<string, unknown>;
  stageClaimed: boolean;
  statusClaimed: boolean;
  stageEventIdValue: string | undefined;
  statusEventIdValue: string | undefined;
  stageMap: {
    meta_event_name: string | null;
    ga4_event_name: string | null;
  } | null;
  statusMap: {
    meta_event_name: string | null;
    ga4_event_name: string | null;
  } | null;
}): Promise<ProcessPipedriveResult> {
  const {
    conn,
    dealId,
    stageClaimed,
    statusClaimed,
    stageEventIdValue,
    statusEventIdValue,
    stageMap,
    statusMap,
  } = opts;
  let { stageId, dealStatus } = opts;
  const { data } = opts;
  let pipelineId: string | null = null;
  let personId: string | null = null;

  // Enrich only on first claim — deal + person for email/phone.
  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;
  let value: number | undefined;

  if (typeof data.value === "number") value = data.value;

  const deal = await getDeal(conn, dealId);
  if (deal) {
    stageId = idStr(deal.stage_id) || stageId;
    pipelineId = idStr(deal.pipeline_id) || pipelineId;
    personId = idStr(deal.person_id) || personId;
    if (!dealStatus && isDealStatus(deal.status)) {
      dealStatus = deal.status;
    }
    if (typeof deal.value === "number") value = deal.value;
    const personName =
      deal.person_name && typeof deal.person_name === "string"
        ? deal.person_name
        : null;
    if (personName) name = personName;
  }

  if (personId) {
    const person = await getPerson(conn, personId);
    if (person) {
      const extracted = extractPersonEmailPhone(person);
      email = extracted.email;
      phone = extracted.phone;
      if (extracted.name) name = extracted.name;
    }
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

  if (stageClaimed && stageEventIdValue && stageMap) {
    const eventName =
      stageMap.meta_event_name || stageMap.ga4_event_name || "Lead";
    const results = await dispatchMapped({
      eventId: stageEventIdValue,
      metaEventName: stageMap.meta_event_name,
      ga4EventName: stageMap.ga4_event_name,
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
      eventId: stageEventIdValue,
      visitor,
      results,
    });
  }

  if (statusClaimed && statusEventIdValue && statusMap && dealStatus) {
    const eventName =
      statusMap.meta_event_name || statusMap.ga4_event_name || "Lead";
    const includeValue = dealStatus === "won" && value != null;
    const results = await dispatchMapped({
      eventId: statusEventIdValue,
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
      eventId: statusEventIdValue,
      visitor,
      results,
    });
  }

  await upsertDealState(
    conn.id,
    dealId,
    stageId || `status:${dealStatus ?? "unknown"}`,
    hashEmail(email),
    dealStatus
  );

  return {
    ok: true,
    event_id: stageEventIdValue ?? statusEventIdValue,
    deduped: !stageClaimed && !statusClaimed,
    match: { status: match.match_status, reason: match.match_reason },
  };
}
