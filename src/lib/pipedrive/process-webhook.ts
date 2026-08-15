import "server-only";

import { dispatchMapped, persistEventLog } from "@/lib/crm/dispatch";
import { persistCrmWonPurchase } from "@/lib/crm/persist-won";
import {
  buildCrmSaleCustomData,
  parseCrmProductList,
  parseNumeric,
} from "@/lib/crm/sale-payload";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  extractPersonEmailPhone,
  getDeal,
  getDealProducts,
  getPerson,
} from "@/lib/pipedrive/api";
import { hashEmail, sha256 } from "@/lib/tracking/hash";
import { ensureVisitorFromPii } from "@/lib/tracking/ensure-visitor-from-pii";

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

export async function loadStageMap(
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
  let value = parseNumeric(data.value);
  let currency =
    typeof data.currency === "string" ? data.currency : null;
  let dealName =
    (typeof data.title === "string" && data.title) ||
    (typeof data.name === "string" && data.name) ||
    null;
  let products = parseCrmProductList(data.products);

  const deal = await getDeal(conn, dealId);
  if (deal) {
    stageId = idStr(deal.stage_id) || stageId;
    pipelineId = idStr(deal.pipeline_id) || pipelineId;
    personId = idStr(deal.person_id) || personId;
    if (!dealStatus && isDealStatus(deal.status)) {
      dealStatus = deal.status;
    }
    const dealValue = parseNumeric(deal.value);
    if (dealValue != null) value = dealValue;
    if (typeof deal.currency === "string" && deal.currency) {
      currency = deal.currency;
    }
    if (typeof deal.title === "string" && deal.title) dealName = deal.title;
    const personName =
      deal.person_name && typeof deal.person_name === "string"
        ? deal.person_name
        : null;
    if (personName) name = personName;
  }

  if (products.length === 0) {
    products = parseCrmProductList(await getDealProducts(conn, dealId));
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

  const identity = await ensureVisitorFromPii({
    email,
    phone,
    name,
    dealId,
  });
  const { visitor, trckUserId, gaResolved, attr, match, userData } = identity;
  const customData = buildCrmSaleCustomData({
    dealId,
    dealName,
    value,
    currency,
    products,
  });

  if (stageClaimed && stageEventIdValue && stageMap) {
    const eventName =
      stageMap.meta_event_name || stageMap.ga4_event_name || "Lead";
    const results = await dispatchMapped({
      eventId: stageEventIdValue,
      metaEventName: stageMap.meta_event_name,
      ga4EventName: stageMap.ga4_event_name,
      eventSourceUrl: null,
      userData,
      customData,
      gaClientId: gaResolved.clientId,
      gaClientIdSource: gaResolved.source,
      gaIdentityMeta: gaResolved.meta,
      gaSessionId: visitor?.ga_session_id,
      gclid: attr.gclid,
      wbraid: attr.wbraid,
      gbraid: attr.gbraid,
      transactionId: dealId,
      gaUserId: trckUserId,
    });
    await persistEventLog({
      trckUserId,
      eventName,
      eventId: stageEventIdValue,
      visitor,
      results,
      ingestPath: conn.provider,
    });
  }

  if (statusClaimed && statusEventIdValue && statusMap && dealStatus) {
    const eventName =
      statusMap.meta_event_name || statusMap.ga4_event_name || "Lead";
    const results = await dispatchMapped({
      eventId: statusEventIdValue,
      metaEventName: statusMap.meta_event_name,
      ga4EventName: statusMap.ga4_event_name,
      eventSourceUrl: null,
      userData,
      customData: dealStatus === "won" ? customData : undefined,
      gaClientId: gaResolved.clientId,
      gaClientIdSource: gaResolved.source,
      gaIdentityMeta: gaResolved.meta,
      gaSessionId: visitor?.ga_session_id,
      gclid: attr.gclid,
      wbraid: attr.wbraid,
      gbraid: attr.gbraid,
      transactionId: dealId,
      gaUserId: trckUserId,
    });
    await persistEventLog({
      trckUserId,
      eventName,
      eventId: statusEventIdValue,
      visitor,
      results,
      ingestPath: conn.provider,
    });
    if (dealStatus === "won") {
      await persistCrmWonPurchase({
        provider: "pipedrive",
        dealId,
        eventId: statusEventIdValue,
        email,
        phone,
        visitor,
        customData,
        gaClientId: gaResolved.clientId,
      });
    }
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
