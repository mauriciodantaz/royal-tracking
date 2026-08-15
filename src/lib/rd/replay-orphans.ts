import "server-only";

import { persistCrmWonPurchase } from "@/lib/crm/persist-won";
import {
  buildCrmSaleCustomData,
  parseCrmProductList,
} from "@/lib/crm/sale-payload";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { getConnection } from "@/lib/integrations/connections";
import {
  extractContactEmailPhone,
  getCrmContact,
  getCrmDeal,
  getCrmDealProducts,
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
import { ensureVisitorFromPii } from "@/lib/tracking/ensure-visitor-from-pii";

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

async function replayCrmDeal(opts: {
  conn: Awaited<ReturnType<typeof getConnection>>;
  dealId: string;
  eventId: string;
  map: { meta_event_name: string | null; ga4_event_name: string | null };
  includeValue: boolean;
  persistWon?: boolean;
  replaceExisting?: boolean;
}): Promise<"sent" | "skipped"> {
  const conn = opts.conn;
  if (!conn) return "skipped";

  const deal = await getCrmDeal(conn, opts.dealId);
  if (!deal) {
    throw new Error("crm_deal_unavailable");
  }
  const parsed = parseCrmDealFields(deal);
  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;
  let products = parsed.products;
  if (products.length === 0) {
    products = parseCrmProductList(await getCrmDealProducts(conn, opts.dealId));
  }
  const contactId = parsed.contactIds[0];
  if (contactId) {
    const contact = await getCrmContact(conn, contactId);
    if (contact) {
      const extracted = extractContactEmailPhone(contact);
      email = extracted.email;
      phone = extracted.phone;
      name = extracted.name;
    }
  }

  const identity = await ensureVisitorFromPii({
    email,
    phone,
    name,
    dealId: opts.dealId,
  });
  const customData = opts.includeValue
    ? buildCrmSaleCustomData({
        dealId: opts.dealId,
        dealName: parsed.dealName,
        value: parsed.value,
        products,
      })
    : undefined;
  const eventName =
    opts.map.meta_event_name || opts.map.ga4_event_name || "Lead";
  const results = await dispatchMapped({
    eventId: opts.eventId,
    metaEventName: opts.map.meta_event_name,
    ga4EventName: opts.map.ga4_event_name,
    eventSourceUrl: null,
    userData: identity.userData,
    customData,
    gaClientId: identity.gaResolved.clientId,
    gaClientIdSource: identity.gaResolved.source,
    gaIdentityMeta: identity.gaResolved.meta,
    gaSessionId: identity.visitor?.ga_session_id,
    gclid: identity.attr.gclid,
    wbraid: identity.attr.wbraid,
    gbraid: identity.attr.gbraid,
    transactionId: opts.dealId,
    gaUserId: identity.trckUserId,
  });
  await persistEventLog({
    trckUserId: identity.trckUserId,
    eventName,
    eventId: opts.eventId,
    visitor: identity.visitor,
    results,
    ingestPath: conn.provider,
    replaceExisting: opts.replaceExisting,
  });
  if (opts.persistWon && customData) {
    await persistCrmWonPurchase({
      provider: "rdcrm",
      dealId: opts.dealId,
      eventId: opts.eventId,
      email,
      phone,
      visitor: identity.visitor,
      customData,
      gaClientId: identity.gaResolved.clientId,
    });
  }
  return "sent";
}

async function replayMktConverted(opts: {
  conn: Awaited<ReturnType<typeof getConnection>>;
  contactKey: string;
  eventId: string;
  map: { meta_event_name: string | null; ga4_event_name: string | null };
  replaceExisting?: boolean;
}): Promise<"sent" | "skipped"> {
  const conn = opts.conn;
  if (!conn) return "skipped";

  const raw = await getMktContact(conn, opts.contactKey);
  if (!raw) {
    throw new Error("mkt_contact_unavailable");
  }
  const contact = extractMktContact(raw);
  const identity = await ensureVisitorFromPii({
    email: contact.email,
    phone: contact.phone,
    name: contact.name,
    dealId: opts.contactKey,
  });
  const eventName =
    opts.map.meta_event_name || opts.map.ga4_event_name || "Lead";
  const results = await dispatchMapped({
    eventId: opts.eventId,
    metaEventName: opts.map.meta_event_name,
    ga4EventName: opts.map.ga4_event_name,
    userData: identity.userData,
    gaClientId: identity.gaResolved.clientId,
    gaClientIdSource: identity.gaResolved.source,
    gaIdentityMeta: identity.gaResolved.meta,
    gaSessionId: identity.visitor?.ga_session_id,
    gclid: identity.attr.gclid,
    wbraid: identity.attr.wbraid,
    gbraid: identity.attr.gbraid,
    gaUserId: identity.trckUserId,
  });
  await persistEventLog({
    trckUserId: identity.trckUserId,
    eventName,
    eventId: opts.eventId,
    visitor: identity.visitor,
    results,
    ingestPath: conn.provider,
    replaceExisting: opts.replaceExisting,
  });
  return "sent";
}

export async function replayOrphanCrmEmits(
  connectionId: string,
  opts?: { limit?: number }
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
  const stageSkipped = await query<StageOrphan>(
    `select distinct e.deal_external_id, e.pipeline_external_id, e.stage_external_id, e.event_id
     from rd_deal_stage_emits e
     join integration_delivery_log d on d.event_id = e.event_id
     where e.connection_id = $1
       and d.provider = 'ga4'
       and d.status = 'skipped'
       and d.error = 'missing_ga_client_id'
     order by e.deal_external_id`,
    [connectionId]
  );
  const statusSkipped = await query<StatusOrphan>(
    `select distinct e.deal_external_id, e.deal_status, e.event_id
     from rd_deal_status_emits e
     join integration_delivery_log d on d.event_id = e.event_id
     where e.connection_id = $1
       and d.provider = 'ga4'
       and d.status = 'skipped'
       and d.error = 'missing_ga_client_id'
     order by e.deal_external_id`,
    [connectionId]
  );

  const seen = new Set<string>();
  const take = <T extends { event_id: string }>(
    rows: T[],
    replaceExisting: boolean
  ): Array<T & { replaceExisting: boolean }> => {
    const out: Array<T & { replaceExisting: boolean }> = [];
    for (const row of rows) {
      if (seen.has(row.event_id)) continue;
      seen.add(row.event_id);
      out.push({ ...row, replaceExisting });
    }
    return out;
  };

  let stageRows = [
    ...take(stageOrphans.rows, false),
    ...take(stageSkipped.rows, true),
  ];
  let statusRows = [
    ...take(statusOrphans.rows, false),
    ...take(statusSkipped.rows, true),
  ];

  const limit = opts?.limit && opts.limit > 0 ? opts.limit : undefined;
  if (limit != null) {
    stageRows = stageRows.slice(0, limit);
    const remaining = limit - stageRows.length;
    statusRows = remaining > 0 ? statusRows.slice(0, remaining) : [];
  }

  const result: ReplayOrphansResult = {
    attempted: stageRows.length + statusRows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const pushErr = (msg: string) => {
    if (result.errors.length < 12) result.errors.push(msg);
  };

  for (const row of stageRows) {
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
          replaceExisting: row.replaceExisting,
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
        replaceExisting: row.replaceExisting,
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

  for (const row of statusRows) {
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
        persistWon: dealStatus === "won",
        replaceExisting: row.replaceExisting,
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
