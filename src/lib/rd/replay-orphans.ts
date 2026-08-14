import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { getConnection } from "@/lib/integrations/connections";
import {
  extractContactEmailPhone,
  getCrmContact,
  getCrmDeal,
} from "@/lib/rd/crm";
import {
  isCrmDealStatus,
  parseCrmDealFields,
  type CrmDealStatus,
} from "@/lib/rd/deal-payload";
import { extractMktContact, getMktContact } from "@/lib/rd/mkt";
import {
  dispatchMapped,
  loadStageMap,
  persistEventLog,
} from "@/lib/rd/process-webhook";
import { resolveConversionAttribution } from "@/lib/tracking/attribution";
import { hashEmail, hashPhone, hashPii } from "@/lib/tracking/hash";
import { matchAndMergeVisitor } from "@/lib/tracking/match";
import { resolveAndPersistGaClientId } from "@/lib/tracking/persist-ga-client-id";

export type ReplayOrphansResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type StageOrphan = {
  deal_external_id: string;
  pipeline_external_id: string;
  stage_external_id: string;
  event_id: string;
};

type StatusOrphan = {
  deal_external_id: string;
  deal_status: string;
  event_id: string;
};

async function buildVisitorContext(opts: {
  email: string | null;
  phone: string | null;
  name: string | null;
}) {
  const match = await matchAndMergeVisitor({
    email: opts.email,
    phone: opts.phone,
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
  return {
    visitor,
    trckUserId,
    gaResolved,
    userData: {
      email: opts.email ?? visitor?.email,
      emailHash: hashEmail(opts.email) ?? visitor?.email_hash,
      phoneHash: hashPhone(opts.phone) ?? visitor?.phone_hash,
      firstNameHash:
        hashPii(opts.name?.split(/\s+/)[0]) ?? visitor?.first_name_hash,
      lastNameHash:
        hashPii(opts.name?.split(/\s+/).slice(1).join(" ")) ??
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
    gclid: attr.gclid,
    wbraid: attr.wbraid,
    gbraid: attr.gbraid,
  };
}

async function replayCrmDeal(opts: {
  conn: Awaited<ReturnType<typeof getConnection>>;
  dealId: string;
  eventId: string;
  map: { meta_event_name: string | null; ga4_event_name: string | null };
  includeValue: boolean;
}): Promise<"sent" | "skipped"> {
  const conn = opts.conn;
  if (!conn) return "skipped";

  const deal = await getCrmDeal(conn, opts.dealId);
  const parsed = deal ? parseCrmDealFields(deal) : null;
  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;
  const value = parsed?.value;
  const contactId = parsed?.contactIds[0];
  if (contactId) {
    const contact = await getCrmContact(conn, contactId);
    if (contact) {
      const extracted = extractContactEmailPhone(contact);
      email = extracted.email;
      phone = extracted.phone;
      name = extracted.name;
    }
  }

  const ctx = await buildVisitorContext({ email, phone, name });
  const eventName =
    opts.map.meta_event_name || opts.map.ga4_event_name || "Lead";
  const results = await dispatchMapped({
    eventId: opts.eventId,
    metaEventName: opts.map.meta_event_name,
    ga4EventName: opts.map.ga4_event_name,
    eventSourceUrl: null,
    userData: ctx.userData,
    customData:
      opts.includeValue && value != null
        ? { value, currency: "BRL", content_type: "product" }
        : undefined,
    gaClientId: ctx.gaResolved.clientId,
    gaClientIdSource: ctx.gaResolved.source,
    gaIdentityMeta: ctx.gaResolved.meta,
    gaSessionId: ctx.visitor?.ga_session_id,
    gclid: ctx.gclid,
    wbraid: ctx.wbraid,
    gbraid: ctx.gbraid,
  });
  await persistEventLog({
    trckUserId: ctx.trckUserId,
    eventName,
    eventId: opts.eventId,
    visitor: ctx.visitor,
    results,
  });
  return "sent";
}

async function replayMktConverted(opts: {
  conn: Awaited<ReturnType<typeof getConnection>>;
  contactKey: string;
  eventId: string;
  map: { meta_event_name: string | null; ga4_event_name: string | null };
}): Promise<"sent" | "skipped"> {
  const conn = opts.conn;
  if (!conn) return "skipped";

  const raw = await getMktContact(conn, opts.contactKey);
  if (!raw) return "skipped";
  const contact = extractMktContact(raw);
  const ctx = await buildVisitorContext({
    email: contact.email,
    phone: contact.phone,
    name: contact.name,
  });
  const eventName =
    opts.map.meta_event_name || opts.map.ga4_event_name || "Lead";
  const results = await dispatchMapped({
    eventId: opts.eventId,
    metaEventName: opts.map.meta_event_name,
    ga4EventName: opts.map.ga4_event_name,
    userData: ctx.userData,
    gaClientId: ctx.gaResolved.clientId,
    gaClientIdSource: ctx.gaResolved.source,
    gaIdentityMeta: ctx.gaResolved.meta,
    gaSessionId: ctx.visitor?.ga_session_id,
    gclid: ctx.gclid,
    wbraid: ctx.wbraid,
    gbraid: ctx.gbraid,
  });
  await persistEventLog({
    trckUserId: ctx.trckUserId,
    eventName,
    eventId: opts.eventId,
    visitor: ctx.visitor,
    results,
  });
  return "sent";
}

export async function replayOrphanCrmEmits(
  connectionId: string
): Promise<ReplayOrphansResult> {
  await ensureDbReady();
  const conn = await getConnection(connectionId);
  if (!conn) {
    return {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["connection_not_found"],
    };
  }

  const stageOrphans = await query<StageOrphan>(
    `select e.deal_external_id, e.pipeline_external_id, e.stage_external_id, e.event_id
     from rd_deal_stage_emits e
     left join events_log l on l.event_id = e.event_id
     where e.connection_id = $1 and l.id is null
     order by e.created_at asc`,
    [connectionId]
  );
  const statusOrphans = await query<StatusOrphan>(
    `select e.deal_external_id, e.deal_status, e.event_id
     from rd_deal_status_emits e
     left join events_log l on l.event_id = e.event_id
     where e.connection_id = $1 and l.id is null
     order by e.created_at asc`,
    [connectionId]
  );

  const result: ReplayOrphansResult = {
    attempted: stageOrphans.rows.length + statusOrphans.rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const pushErr = (msg: string) => {
    if (result.errors.length < 12) result.errors.push(msg);
  };

  for (const row of stageOrphans.rows) {
    try {
      if (row.pipeline_external_id === "mkt") {
        const lifecycle = row.stage_external_id.replace(/^mkt:/, "");
        const map = await loadStageMap(connectionId, {
          mktLifecycle: lifecycle,
        });
        if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
          result.skipped += 1;
          continue;
        }
        const outcome = await replayMktConverted({
          conn,
          contactKey: row.deal_external_id,
          eventId: row.event_id,
          map,
        });
        if (outcome === "sent") result.sent += 1;
        else result.skipped += 1;
        continue;
      }

      const map = await loadStageMap(connectionId, {
        stageExternalId: row.stage_external_id,
      });
      if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
        result.skipped += 1;
        continue;
      }
      const outcome = await replayCrmDeal({
        conn,
        dealId: row.deal_external_id,
        eventId: row.event_id,
        map,
        includeValue: true,
      });
      if (outcome === "sent") result.sent += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      pushErr(
        `stage ${row.deal_external_id}: ${err instanceof Error ? err.message : "fail"}`
      );
    }
  }

  for (const row of statusOrphans.rows) {
    try {
      if (!isCrmDealStatus(row.deal_status)) {
        result.skipped += 1;
        continue;
      }
      const dealStatus: CrmDealStatus = row.deal_status;
      const map = await loadStageMap(connectionId, { dealStatus });
      if (!map || (!map.meta_event_name && !map.ga4_event_name)) {
        result.skipped += 1;
        continue;
      }
      const outcome = await replayCrmDeal({
        conn,
        dealId: row.deal_external_id,
        eventId: row.event_id,
        map,
        includeValue: dealStatus === "won",
      });
      if (outcome === "sent") result.sent += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      pushErr(
        `status ${row.deal_external_id}: ${err instanceof Error ? err.message : "fail"}`
      );
    }
  }

  return result;
}
