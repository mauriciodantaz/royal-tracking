import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow, VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import {
  classifyChannel,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import { hashPhone, hashPii, newEventId } from "@/lib/tracking/hash";
import { matchVisitorFromTicket } from "@/lib/whatsapp/match-ticket";
import {
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
  if (!ticket) {
    return { ok: true, ignored: true, reason: "no_ticket" };
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

  const match = await matchVisitorFromTicket({
    ticketValue: ticket.value,
    phone: msg.phone,
  });
  const visitor = match.visitor;
  const trckUserId = visitor?.trck_user_id ?? null;

  if (visitor) {
    await enrichVisitorPhone(visitor, msg.phone, msg.pushName);
  }

  const phoneHash = hashPhone(msg.phone) ?? visitor?.phone_hash ?? null;
  const fields = {
    ticket_name: ticket.name,
    ticket_value: ticket.value,
    push_name: msg.pushName ?? "",
    phone: msg.phone ?? "",
    message_id: msg.messageId,
    text: msg.text.slice(0, 2000),
  };

  let leadId: string | null = null;
  try {
    const lead = await queryOne<{ id: string }>(
      `insert into form_leads (
         form_id, trck_user_id, email, phone, email_hash, phone_hash, name,
         fields, page_url,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         fbp, fbc, ga_client_id, source_provider, source_connection_id,
         consent, raw_payload, event_id, match_status, match_reason
       ) values (
         null,$1,$2,$3,$4,$5,$6,$7::jsonb,null,
         $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
         null,$18::jsonb,$19,$20,$21
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
        visitor?.ga_client_id ?? null,
        conn.provider,
        conn.id,
        JSON.stringify(opts.raw),
        eventId,
        match.match_status,
        match.match_reason,
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

  const dispatch = await dispatchEvent({
    sourceProvider: conn.provider,
    sourceConnectionId: conn.id,
    sourceEvent: "Lead",
    eventId,
    userData: {
      email: visitor?.email,
      emailHash: visitor?.email_hash,
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
      clientIpAddress: visitor?.ip,
      clientUserAgent: visitor?.user_agent,
    },
    gaClientId: visitor?.ga_client_id,
    gaSessionId: visitor?.ga_session_id,
  });

  const { serverMeta, serverGa4 } = serverFlagsFromDispatch(dispatch.results);
  const channelClass = classifyChannel({
    webMeta: false,
    webGa4: false,
    serverMeta,
    serverGa4,
  });

  try {
    await query(
      `insert into events_log (
         trck_user_id, event_name, event_id,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         ip, ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
       ) values (
         $1,'Lead',$2,$3,$4,$5,$6,$7,$8,'webhook',false,false,$9,$10,$11
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
        visitor?.ip ?? null,
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
      reason: match.match_reason,
    },
  };
}
