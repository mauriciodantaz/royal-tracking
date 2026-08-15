import "server-only";

import { dispatchMapped, persistEventLog } from "@/lib/crm/dispatch";
import { persistCrmWonPurchase } from "@/lib/crm/persist-won";
import {
  buildCrmSaleCustomData,
  parseCrmProductList,
} from "@/lib/crm/sale-payload";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import { hashEmail, sha256 } from "@/lib/tracking/hash";
import { ensureVisitorFromPii } from "@/lib/tracking/ensure-visitor-from-pii";
import {
  extractContactEmailPhone,
  getCrmContact,
  getCrmDeal,
  getCrmDealProducts,
} from "@/lib/rd/crm";
import {
  asRecord,
  parseCrmDealFields,
  type CrmDealStatus,
} from "@/lib/rd/deal-payload";
import {
  extractMktContact,
  inferMktLifecycle,
  type MktLifecycleKey,
} from "@/lib/rd/mkt";

export { dispatchMapped, persistEventLog };

export type ProcessRdResult =
  | {
      ok: true;
      deduped?: boolean;
      event_id?: string;
      match?: { status: string; reason: string };
      skipped?: string;
    }
  | { ok: false; error: string; status: number };

export type { CrmDealStatus };

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

async function releaseDealStageEmit(opts: {
  connectionId: string;
  dealExternalId: string;
  pipelineExternalId: string;
  stageExternalId: string;
}): Promise<void> {
  await query(
    `delete from rd_deal_stage_emits
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
  dealStatus: CrmDealStatus;
}): Promise<void> {
  await query(
    `delete from rd_deal_status_emits
     where connection_id = $1
       and deal_external_id = $2
       and deal_status = $3`,
    [opts.connectionId, opts.dealExternalId, opts.dealStatus]
  );
}

async function isPipelineEnabled(
  connectionId: string,
  pipelineExternalId: string
): Promise<boolean> {
  if (!pipelineExternalId) return true;
  const row = await queryOne<{ enabled: boolean }>(
    `select enabled from rd_pipelines
     where connection_id = $1 and external_id = $2 limit 1`,
    [connectionId, pipelineExternalId]
  );
  // Unknown pipeline (not synced yet) → allow; explicitly disabled → block.
  if (!row) return true;
  return row.enabled !== false;
}

export async function loadStageMap(
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

  let {
    dealId,
    stageId,
    pipelineId,
    dealStatus,
    value,
    contactIds,
    dealName,
    products,
  } = parseCrmDealFields(document);

  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;

  const needsDealFetch =
    Boolean(dealId) &&
    (!email ||
      !stageId ||
      !pipelineId ||
      !dealStatus ||
      contactIds.length === 0 ||
      products.length === 0);

  if (needsDealFetch && dealId) {
    const deal = await getCrmDeal(conn, dealId);
    if (deal) {
      const fetched = parseCrmDealFields(deal);
      dealId = fetched.dealId || dealId;
      stageId = fetched.stageId || stageId;
      pipelineId = fetched.pipelineId || pipelineId;
      if (!dealStatus && fetched.dealStatus) dealStatus = fetched.dealStatus;
      if (fetched.value != null) value = fetched.value;
      if (fetched.contactIds.length) contactIds = fetched.contactIds;
      if (fetched.dealName) dealName = fetched.dealName;
      if (fetched.products.length) products = fetched.products;
    }
    if (products.length === 0) {
      const apiProducts = await getCrmDealProducts(conn, dealId);
      const parsed = parseCrmProductList(apiProducts);
      if (parsed.length) products = parsed;
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
    products,
  });

  let stageEventId: string | undefined;
  let stageDeduped = false;
  let stageSkipped: string | undefined;

  if (stageId) {
    const pipeKey = pipelineId || "";
    if (!(await isPipelineEnabled(conn.id, pipeKey))) {
      stageSkipped = "pipeline_disabled";
    }
    const map =
      stageSkipped === "pipeline_disabled"
        ? null
        : await loadStageMap(conn.id, { stageExternalId: stageId });
    if (stageSkipped === "pipeline_disabled") {
      // skip emit
    } else if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
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
        try {
          const eventName = map.meta_event_name || map.ga4_event_name || "Lead";
          const results = await dispatchMapped({
            eventId: stageEventId,
            metaEventName: map.meta_event_name,
            ga4EventName: map.ga4_event_name,
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
            eventId: stageEventId,
            visitor,
            results,
          });
        } catch (err) {
          await releaseDealStageEmit({
            connectionId: conn.id,
            dealExternalId: dealId,
            pipelineExternalId: pipeKey,
            stageExternalId: stageId,
          });
          throw err;
        }
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
        try {
          const eventName =
            statusMap.meta_event_name || statusMap.ga4_event_name || "Lead";
          const results = await dispatchMapped({
            eventId: statusEventId,
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
            eventId: statusEventId,
            visitor,
            results,
          });
          if (dealStatus === "won") {
            await persistCrmWonPurchase({
              provider: "rdcrm",
              dealId,
              eventId: statusEventId,
              email,
              phone,
              visitor,
              customData,
              gaClientId: gaResolved.clientId,
            });
          }
        } catch (err) {
          await releaseDealStatusEmit({
            connectionId: conn.id,
            dealExternalId: dealId,
            dealStatus,
          });
          throw err;
        }
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

  try {
    const identity = await ensureVisitorFromPii({
      email: contact.email,
      phone: contact.phone,
      name: contact.name,
      dealId: contact.dealId,
    });
    const { visitor, trckUserId, gaResolved, attr, match, userData } = identity;
    const eventName = map.meta_event_name || map.ga4_event_name || "Lead";

    const results = await dispatchMapped({
      eventId,
      metaEventName: map.meta_event_name,
      ga4EventName: map.ga4_event_name,
      userData,
      gaClientId: gaResolved.clientId,
      gaClientIdSource: gaResolved.source,
      gaIdentityMeta: gaResolved.meta,
      gaSessionId: visitor?.ga_session_id,
      gclid: attr.gclid,
      wbraid: attr.wbraid,
      gbraid: attr.gbraid,
      gaUserId: trckUserId,
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
  } catch (err) {
    await releaseDealStageEmit({
      connectionId: conn.id,
      dealExternalId: contact.dealId,
      pipelineExternalId: "mkt",
      stageExternalId: stageKey,
    });
    throw err;
  }
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
