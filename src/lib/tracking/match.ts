import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { hashEmail, hashPhone, hashPii } from "@/lib/tracking/hash";

export type MatchResult = {
  visitor: VisitorRow | null;
  match_status: "matched" | "unmatched";
  match_reason: string;
};

const ACTIVE = `merged_into_trck_user_id is null`;

async function resolveCanonical(
  visitor: VisitorRow | null
): Promise<VisitorRow | null> {
  if (!visitor) return null;
  let current: VisitorRow | null = visitor;
  const seen = new Set<string>();
  while (current?.merged_into_trck_user_id) {
    if (seen.has(current.trck_user_id)) break;
    seen.add(current.trck_user_id);
    current = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [current.merged_into_trck_user_id]
    );
  }
  if (current?.merged_into_trck_user_id) return null;
  return current;
}

function pickSurvivor(a: VisitorRow, b: VisitorRow): {
  survivor: VisitorRow;
  loser: VisitorRow;
} {
  const aLead = a.first_lead_at ? new Date(a.first_lead_at).getTime() : Infinity;
  const bLead = b.first_lead_at ? new Date(b.first_lead_at).getTime() : Infinity;
  if (aLead !== bLead) {
    return aLead < bLead
      ? { survivor: a, loser: b }
      : { survivor: b, loser: a };
  }
  const aCreated = new Date(a.created_at).getTime();
  const bCreated = new Date(b.created_at).getTime();
  return aCreated <= bCreated
    ? { survivor: a, loser: b }
    : { survivor: b, loser: a };
}

async function mergeVisitors(
  survivor: VisitorRow,
  loser: VisitorRow
): Promise<VisitorRow> {
  if (survivor.trck_user_id === loser.trck_user_id) return survivor;

  // Release unique ticket_code on loser before copying onto survivor.
  const loserTicket = loser.ticket_code;
  if (loserTicket) {
    await query(
      `update visitors set ticket_code = null, updated_at = now()
       where trck_user_id = $1`,
      [loser.trck_user_id]
    );
  }

  await query(
    `update visitors set
       email = coalesce(visitors.email, $2),
       email_hash = coalesce(visitors.email_hash, $3),
       phone_hash = coalesce(visitors.phone_hash, $4),
       first_name_hash = coalesce(visitors.first_name_hash, $5),
       last_name_hash = coalesce(visitors.last_name_hash, $6),
       city_hash = coalesce(visitors.city_hash, $7),
       state_hash = coalesce(visitors.state_hash, $8),
       country_hash = coalesce(visitors.country_hash, $9),
       external_id_hash = coalesce(visitors.external_id_hash, $10),
       fbp = coalesce(visitors.fbp, $11),
       fbc = coalesce(visitors.fbc, $12),
       ga_client_id = coalesce(visitors.ga_client_id, $13),
       ga_client_id_source = coalesce(visitors.ga_client_id_source, $14),
       browser_ga_client_id = coalesce(visitors.browser_ga_client_id, $15),
       ga_session_id = coalesce(visitors.ga_session_id, $16),
       gclid = coalesce(visitors.gclid, $17),
       ttclid = coalesce(visitors.ttclid, $18),
       ctwa_clid = coalesce(visitors.ctwa_clid, $19),
       wbraid = coalesce(visitors.wbraid, $20),
       gbraid = coalesce(visitors.gbraid, $21),
       utm_source = coalesce(visitors.utm_source, $22),
       utm_medium = coalesce(visitors.utm_medium, $23),
       utm_campaign = coalesce(visitors.utm_campaign, $24),
       utm_term = coalesce(visitors.utm_term, $25),
       utm_content = coalesce(visitors.utm_content, $26),
       referrer = coalesce(visitors.referrer, $27),
       ip = coalesce(visitors.ip, $28),
       user_agent = coalesce(visitors.user_agent, $29),
       ticket_code = coalesce(visitors.ticket_code, $30),
       first_lead_at = case
         when visitors.first_lead_at is null then $31::timestamptz
         when $31::timestamptz is null then visitors.first_lead_at
         when $31::timestamptz < visitors.first_lead_at then $31::timestamptz
         else visitors.first_lead_at
       end,
       ft_utm_source = coalesce(visitors.ft_utm_source, $32),
       ft_utm_medium = coalesce(visitors.ft_utm_medium, $33),
       ft_utm_campaign = coalesce(visitors.ft_utm_campaign, $34),
       ft_utm_term = coalesce(visitors.ft_utm_term, $35),
       ft_utm_content = coalesce(visitors.ft_utm_content, $36),
       ft_referrer = coalesce(visitors.ft_referrer, $37),
       ft_fbp = coalesce(visitors.ft_fbp, $38),
       ft_fbc = coalesce(visitors.ft_fbc, $39),
       ft_gclid = coalesce(visitors.ft_gclid, $40),
       ft_ttclid = coalesce(visitors.ft_ttclid, $41),
       ft_ctwa_clid = coalesce(visitors.ft_ctwa_clid, $42),
       ft_wbraid = coalesce(visitors.ft_wbraid, $43),
       ft_gbraid = coalesce(visitors.ft_gbraid, $44),
       updated_at = now()
     where trck_user_id = $1`,
    [
      survivor.trck_user_id,
      loser.email,
      loser.email_hash,
      loser.phone_hash,
      loser.first_name_hash,
      loser.last_name_hash,
      loser.city_hash,
      loser.state_hash,
      loser.country_hash,
      loser.external_id_hash,
      loser.fbp,
      loser.fbc,
      loser.ga_client_id,
      loser.ga_client_id_source,
      loser.browser_ga_client_id,
      loser.ga_session_id,
      loser.gclid,
      loser.ttclid,
      loser.ctwa_clid,
      loser.wbraid,
      loser.gbraid,
      loser.utm_source,
      loser.utm_medium,
      loser.utm_campaign,
      loser.utm_term,
      loser.utm_content,
      loser.referrer,
      loser.ip,
      loser.user_agent,
      loserTicket,
      loser.first_lead_at,
      loser.ft_utm_source,
      loser.ft_utm_medium,
      loser.ft_utm_campaign,
      loser.ft_utm_term,
      loser.ft_utm_content,
      loser.ft_referrer,
      loser.ft_fbp,
      loser.ft_fbc,
      loser.ft_gclid,
      loser.ft_ttclid,
      loser.ft_ctwa_clid,
      loser.ft_wbraid,
      loser.ft_gbraid,
    ]
  );

  await query(
    `update visitors set
       merged_into_trck_user_id = $2,
       updated_at = now()
     where trck_user_id = $1
       and merged_into_trck_user_id is null`,
    [loser.trck_user_id, survivor.trck_user_id]
  );

  await query(
    `update form_leads set trck_user_id = $2, updated_at = now()
     where trck_user_id = $1`,
    [loser.trck_user_id, survivor.trck_user_id]
  );
  await query(
    `update purchases set trck_user_id = $2, updated_at = now()
     where trck_user_id = $1`,
    [loser.trck_user_id, survivor.trck_user_id]
  );

  const refreshed = await queryOne<VisitorRow>(
    `select * from visitors where trck_user_id = $1 limit 1`,
    [survivor.trck_user_id]
  );
  return refreshed ?? survivor;
}

async function enrichSurvivorPii(
  survivor: VisitorRow,
  input: { email?: string | null; phone?: string | null }
): Promise<VisitorRow> {
  const emailHash = hashEmail(input.email);
  const phoneHash = hashPhone(input.phone);
  if (!emailHash && !phoneHash && !input.email) return survivor;

  const updated = await queryOne<VisitorRow>(
    `update visitors set
       email = coalesce($2, email),
       email_hash = coalesce($3, email_hash),
       phone_hash = coalesce($4, phone_hash),
       external_id_hash = coalesce(external_id_hash, $5),
       updated_at = now()
     where trck_user_id = $1
       and merged_into_trck_user_id is null
     returning *`,
    [
      survivor.trck_user_id,
      input.email?.trim() || null,
      emailHash,
      phoneHash,
      hashPii(survivor.trck_user_id),
    ]
  );
  return updated ?? survivor;
}

function matchReasonFor(
  input: {
    trck_user_id?: string | null;
    email?: string | null;
    phone?: string | null;
  },
  visitor: VisitorRow,
  merged: boolean
): string {
  if (merged) return "merged_identity";
  if (input.trck_user_id && visitor.trck_user_id === input.trck_user_id) {
    return "trck_user_id";
  }
  const emailHash = hashEmail(input.email);
  if (emailHash && visitor.email_hash === emailHash) return "email_hash";
  const phoneHash = hashPhone(input.phone);
  if (phoneHash && visitor.phone_hash === phoneHash) return "phone_hash";
  return "identity";
}

/**
 * Resolve visitor by trck_user_id → email_hash → phone_hash (OR identity).
 * When email and phone point at different active visitors, merge into the oldest.
 */
export async function matchAndMergeVisitor(input: {
  trck_user_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<MatchResult> {
  await ensureDbReady();

  const candidates: VisitorRow[] = [];
  const seen = new Set<string>();

  const push = (row: VisitorRow | null) => {
    if (!row || row.merged_into_trck_user_id) return;
    if (seen.has(row.trck_user_id)) return;
    seen.add(row.trck_user_id);
    candidates.push(row);
  };

  if (input.trck_user_id) {
    const byId = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [input.trck_user_id]
    );
    push(await resolveCanonical(byId));
  }

  const emailHash = hashEmail(input.email);
  if (emailHash) {
    const { rows } = await query<VisitorRow>(
      `select * from visitors
       where email_hash = $1 and ${ACTIVE}
       order by coalesce(first_lead_at, created_at) asc
       limit 20`,
      [emailHash]
    );
    for (const row of rows) push(row);
  }

  const phoneHash = hashPhone(input.phone);
  if (phoneHash) {
    const { rows } = await query<VisitorRow>(
      `select * from visitors
       where phone_hash = $1 and ${ACTIVE}
       order by coalesce(first_lead_at, created_at) asc
       limit 20`,
      [phoneHash]
    );
    for (const row of rows) push(row);
  }

  if (candidates.length === 0) {
    return {
      visitor: null,
      match_status: "unmatched",
      match_reason: "no_visitor",
    };
  }

  let survivor = candidates[0]!;
  let didMerge = false;
  for (let i = 1; i < candidates.length; i++) {
    const other = candidates[i]!;
    const pick = pickSurvivor(survivor, other);
    survivor = await mergeVisitors(pick.survivor, pick.loser);
    didMerge = true;
  }

  survivor = await enrichSurvivorPii(survivor, input);

  return {
    visitor: survivor,
    match_status: "matched",
    match_reason: matchReasonFor(input, survivor, didMerge),
  };
}

/** @deprecated Prefer matchAndMergeVisitor for OR identity + merge. */
export async function matchVisitor(input: {
  trck_user_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<MatchResult> {
  return matchAndMergeVisitor(input);
}
