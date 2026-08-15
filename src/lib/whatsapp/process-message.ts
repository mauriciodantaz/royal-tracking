import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow, VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import { captureFirstTouchIfNeeded } from "@/lib/tracking/first-touch";
import { hashPhone, hashPii, newEventId, newTrckUserId } from "@/lib/tracking/hash";
import {
  matchAndMergeVisitor,
  type MatchResult,
} from "@/lib/tracking/match";
import { resolveAndPersistGaClientId } from "@/lib/tracking/persist-ga-client-id";
import {
  matchVisitorFromCtwa,
  matchVisitorFromTicket,
} from "@/lib/whatsapp/match-ticket";
import {
  hasCtwaAttribution,
  normalizeWhatsappPayload,
  type NormalizedWhatsappMessage,
} from "@/lib/whatsapp/normalize";
import { parseTicket } from "@/lib/whatsapp/ticket";

export type ProcessWhatsappResult =
  | {
      ok: true;
      ignored?: boolean;
      reason?: string;
      deduped?: boolean;
      lead_id?: string | null;
      event_id?: string;
      match?: { status: string; reason: string | null };
    }
  | { ok: false; error: string; status: number };

function eventIdForMessage(
  provider: string,
  messageId: string
): string {
  const safe = messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return `wa_${provider}_${safe || newEventId()}`;
}

async function enrichVisitorPhone(
  visitor: VisitorRow,
  phone: string | null,
  pushName: string | null
): Promise<void> {
  if (!phone && !pushName) return;
  const phoneHash = hashPhone(phone);
  await query(
    `update visitors set
       phone_hash = coalesce($2, phone_hash),
       first_name_hash = coalesce($3, first_name_hash),
       updated_at = now()
     where trck_user_id = $1`,
    [
      visitor.trck_user_id,
      phoneHash,
      pushName ? hashPii(pushName.split(/\s+/)[0] ?? pushName) : null,
    ]
  );
}

async function persistCtwaOnVisitor(
  visitor: VisitorRow | null,
  ctwaClid: string | null
): Promise<VisitorRow | null> {
  if (!ctwaClid) return visitor;
  if (visitor) {
    await query(
      `update visitors set
         ctwa_clid = coalesce($2, ctwa_clid),
         updated_at = now()
       where trck_user_id = $1`,
      [visitor.trck_user_id, ctwaClid]
    );
    return {
      ...visitor,
      ctwa_clid: visitor.ctwa_clid ?? ctwaClid,
    };
  }

  const trckUserId = newTrckUserId();
  const created = await queryOne<VisitorRow>(
    `insert into visitors (trck_user_id, ctwa_clid, external_id_hash)
     values ($1, $2, $3)
     returning *`,
    [trckUserId, ctwaClid, hashPii(trckUserId)]
  );
  return created;
}

export async function processWhatsappMessageWebhook(opts: {
  conn: IntegrationConnectionRow;
  raw: unknown;
}): Promise<ProcessWhatsappResult> {
  await ensureDbReady();

  if (
    opts.conn.provider !== "evolution_api" &&
    opts.conn.provider !== "uazapi" &&
    opts.conn.provider !== "rdstation_conversas"
  ) {
    return { ok: false, error: "invalid_provider", status: 400 };
  }

  const normalized = normalizeWhatsappPayload(
    opts.conn.provider,
    opts.raw
  );
  if (!normalized) {
    return { ok: true, ignored: true, reason: "unrecognized_payload" };
  }

  return processNormalizedWhatsappMessage({
    conn: opts.conn,
    msg: normalized,
    raw: opts.raw,
  });
}

export async function processNormalizedWhatsappMessage(opts: {
  conn: IntegrationConnectionRow;
  msg: NormalizedWhatsappMessage;
  raw: unknown;
}): Promise<ProcessWhatsappResult> {
  const { conn, msg } = opts;

  if (msg.fromMe) {
    return { ok: true, ignored: true, reason: "from_me" };
  }
  if (msg.isGroup) {
    return { ok: true, ignored: true, reason: "group" };
  }

  const ticket = parseTicket(msg.text);
  const ctwa = hasCtwaAttribution(msg);
  const phoneHashEarly = hashPhone(msg.phone);

  // Without ticket/CTWA: still accept Lead via phone match or first-time organic.
  if (!ticket && !ctwa) {
    if (!phoneHashEarly) {
      return { ok: true, ignored: true, reason: "no_ticket_no_phone" };
    }
  }

  const eventId = eventIdForMessage(conn.provider, msg.messageId);

  const existing = await queryOne<{ id: string }>(
    `select id from form_leads where event_id = $1 limit 1`,
    [eventId]
  );
  if (existing) {
    return {
      ok: true,
      deduped: true,
      lead_id: existing.id,
      event_id: eventId,
    };
  }

  let match: MatchResult;
  if (ticket) {
    match = await matchVisitorFromTicket({
      ticketValue: ticket.value,
      phone: msg.phone,
    });
  } else if (ctwa) {
    match = await matchVisitorFromCtwa({
      ctwaClid: msg.ctwaClid,
      phone: msg.phone,
    });
  } else {
    match = await matchAndMergeVisitor({ phone: msg.phone });
  }

  // Anti-spam: later WA messages without ticket/CTWA and with a prior Lead for
  // this phone do not emit another Lead — only enrich the profile.
  if (!ticket && !ctwa && phoneHashEarly) {
    const priorLead = await queryOne<{ id: string }>(
      `select id from form_leads
       where phone_hash = $1
       order by created_at asc
       limit 1`,
      [phoneHashEarly]
    );
    if (priorLead) {
      if (match.visitor) {
        await enrichVisitorPhone(match.visitor, msg.phone, msg.pushName);
      }
      return {
        ok: true,
        ignored: true,
        reason: "wa_phone_already_leaded",
        lead_id: priorLead.id,
        match: {
          status: match.match_status,
          reason: match.match_reason,
        },
      };
    }
  }

  let visitor = match.visitor;
  if (visitor) {
    await enrichVisitorPhone(visitor, msg.phone, msg.pushName);
  }
  visitor = await persistCtwaOnVisitor(visitor, msg.ctwaClid);
  if (!match.visitor && visitor && msg.ctwaClid) {
    match = {
      visitor,
      match_status: "matched",
      match_reason: "ctwa_referral",
    };
  }

  // First-time organic: no ticket, no CTWA, no visitor history → create visitor.
  if (!visitor && !ticket && !ctwa && phoneHashEarly) {
    const trckNew = newTrckUserId();
    const firstName = msg.pushName
      ? hashPii(msg.pushName.split(/\s+/)[0] ?? msg.pushName)
      : null;
    visitor = await queryOne<VisitorRow>(
      `insert into visitors (
         trck_user_id, phone_hash, first_name_hash, external_id_hash
       ) values ($1, $2, $3, $4)
       returning *`,
      [trckNew, phoneHashEarly, firstName, hashPii(trckNew)]
    );
    match = {
      visitor,
      match_status: "unmatched",
      match_reason: "wa_no_ticket_organic",
    };
  }

  const trckUserId = visitor?.trck_user_id ?? null;

  if (trckUserId && phoneHashEarly) {
    const touched = await captureFirstTouchIfNeeded({
      trckUserId,
      hasPii: true,
      snapshot: {
        utm_source: visitor?.utm_source,
        utm_medium: visitor?.utm_medium,
        utm_campaign: visitor?.utm_campaign,
        utm_term: visitor?.utm_term,
        utm_content: visitor?.utm_content,
        referrer: visitor?.referrer,
        fbp: visitor?.fbp,
        fbc: visitor?.fbc,
        gclid: visitor?.gclid,
        ttclid: visitor?.ttclid,
        ctwa_clid: msg.ctwaClid ?? visitor?.ctwa_clid,
        wbraid: visitor?.wbraid,
        gbraid: visitor?.gbraid,
      },
    });
    if (touched) visitor = touched;
  }

  const gaResolved = await resolveAndPersistGaClientId({
    stored: visitor?.ga_client_id,
    storedSource: visitor?.ga_client_id_source,
    storedBrowserGa: visitor?.browser_ga_client_id,
    trckUserId,
    visitorCreatedAt: visitor?.created_at,
  });

  const phoneHash = hashPhone(msg.phone) ?? visitor?.phone_hash ?? null;
  const fields = {
    ticket_name: ticket?.name ?? null,
    ticket_value: ticket?.value ?? null,
    push_name: msg.pushName ?? "",
    phone: msg.phone ?? "",
    message_id: msg.messageId,
    text: msg.text.slice(0, 2000),
    ctwa_clid: msg.ctwaClid ?? "",
    referral_source_id: msg.referralSourceId ?? "",
    referral_source_url: msg.referralSourceUrl ?? "",
    referral_source_type: msg.referralSourceType ?? "",
  };

  const matchReason =
    match.match_reason ??
    (ticket ? "ticket" : msg.ctwaClid ? "ctwa_referral" : "unmatched");

  let leadId: string | null = null;
  try {
    const lead = await queryOne<{ id: string }>(
      `insert into form_leads (
         form_id, trck_user_id, email, phone, email_hash, phone_hash, name,
         fields, page_url,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         fbp, fbc, gclid, ttclid, ctwa_clid, ga_client_id,
         source_provider, source_connection_id,
         consent, raw_payload, event_id, match_status, match_reason
       ) values (
         null,$1,$2,$3,$4,$5,$6,$7::jsonb,null,
         $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         null,$21::jsonb,$22,$23,$24
       )
       on conflict (event_id) do nothing
       returning id`,
      [
        trckUserId,
        visitor?.email ?? null,
        msg.phone,
        visitor?.email_hash ?? null,
        phoneHash,
        msg.pushName,
        JSON.stringify(fields),
        visitor?.utm_source ?? null,
        visitor?.utm_medium ?? null,
        visitor?.utm_campaign ?? null,
        visitor?.utm_term ?? null,
        visitor?.utm_content ?? null,
        visitor?.fbp ?? null,
        visitor?.fbc ?? null,
        visitor?.gclid ?? null,
        visitor?.ttclid ?? null,
        msg.ctwaClid ?? visitor?.ctwa_clid ?? null,
        gaResolved.clientId,
        conn.provider,
        conn.id,
        JSON.stringify(opts.raw),
        eventId,
        match.match_status,
        matchReason,
      ]
    );
    leadId = lead?.id ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: true, deduped: true, event_id: eventId };
    }
    throw err;
  }

  if (!leadId) {
    return { ok: true, deduped: true, event_id: eventId };
  }

  const useMessaging =
    Boolean(msg.ctwaClid) || matchReason === "ctwa_referral";

  const dispatch = await dispatchEvent({
    sourceProvider: conn.provider,
    sourceConnectionId: conn.id,
    sourceEvent: "Lead",
    eventId,
    userData: {
      email: visitor?.email,
      emailHash: visitor?.email_hash,
      phone: msg.phone,
      phoneHash,
      firstNameHash: visitor?.first_name_hash,
      lastNameHash: visitor?.last_name_hash,
      cityHash: visitor?.city_hash,
      stateHash: visitor?.state_hash,
      countryHash: visitor?.country_hash,
      externalId: trckUserId,
      externalIdHash: visitor?.external_id_hash,
      fbp: visitor?.fbp,
      fbc: visitor?.fbc,
      ctwaClid: msg.ctwaClid ?? visitor?.ctwa_clid,
      clientIpAddress: visitor?.ip,
      clientUserAgent: visitor?.user_agent,
    },
    gaClientId: gaResolved.clientId,
    gaClientIdSource: gaResolved.source,
    gaIdentityMeta: gaResolved.meta,
    gaSessionId: visitor?.ga_session_id,
    actionSource: useMessaging ? "business_messaging" : "website",
    gclid: visitor?.gclid,
    wbraid: visitor?.wbraid,
    gbraid: visitor?.gbraid,
  });

  const { serverMeta, serverGa4 } = serverFlagsFromDispatch(dispatch.results);
  const channelClass = classifyChannel({
    webMeta: false,
    webGa4: false,
    serverMeta,
    serverGa4,
  });
  const metaResults = dispatch.results.filter((r) => r.provider === "meta_pixel");
  const ga4Results = dispatch.results.filter((r) => r.provider === "ga4");

  try {
    await query(
      `insert into events_log (
         trck_user_id, event_name, event_id,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         payload_meta, response_meta, payload_ga4, response_ga4,
         ip, geo_country, geo_region, geo_city,
         ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
       ) values (
         $1,'Lead',$2,$3,$4,$5,$6,$7,
         $8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,
         $12,$13,$14,$15,
         $16,false,false,$17,$18,$19
       )
       on conflict (event_id) do nothing`,
      [
        trckUserId,
        eventId,
        visitor?.utm_source ?? null,
        visitor?.utm_medium ?? null,
        visitor?.utm_campaign ?? null,
        visitor?.utm_term ?? null,
        visitor?.utm_content ?? null,
        JSON.stringify(metaResults.map((r) => r.payload)),
        JSON.stringify(metaResults),
        JSON.stringify(ga4Results.map((r) => r.payload)),
        JSON.stringify(ga4Results),
        visitor?.ip ?? null,
        visitor?.geo_country ?? null,
        visitor?.geo_region ?? null,
        visitor?.geo_city ?? null,
        conn.provider,
        serverMeta,
        serverGa4,
        channelClass,
      ]
    );
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  return {
    ok: true,
    lead_id: leadId,
    event_id: eventId,
    match: {
      status: match.match_status,
      reason: matchReason,
    },
  };
}
