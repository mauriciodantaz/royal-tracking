import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import { hashPii, newTicketCode, newTrckUserId } from "@/lib/tracking/hash";
import { appendOrReplaceTicket } from "@/lib/whatsapp/ticket";

export type TrackedLinkRow = {
  id: string;
  slug: string;
  label: string | null;
  phone_digits: string;
  message_template: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  connection_id: string | null;
  click_count: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizePhoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function slugifyLabel(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `link-${Date.now().toString(36)}`;
}

export async function getTrackedLinkBySlug(
  slug: string
): Promise<TrackedLinkRow | null> {
  await ensureDbReady();
  return queryOne<TrackedLinkRow>(
    `select * from tracked_links where slug = $1 and active = true limit 1`,
    [slug]
  );
}

export async function listTrackedLinks(): Promise<TrackedLinkRow[]> {
  await ensureDbReady();
  const res = await query<TrackedLinkRow>(
    `select * from tracked_links order by created_at desc limit 200`
  );
  return res.rows;
}

export async function bumpTrackedLinkClick(id: string): Promise<void> {
  await query(
    `update tracked_links set click_count = click_count + 1, updated_at = now()
     where id = $1`,
    [id]
  );
}

/**
 * Upsert visitor from redirect click; returns trck_user_id + ticket_code.
 */
export async function ensureVisitorForRedirect(opts: {
  existingTrckUserId?: string | null;
  link: TrackedLinkRow;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ trckUserId: string; ticketCode: string }> {
  await ensureDbReady();
  const trckUserId = opts.existingTrckUserId?.trim() || newTrckUserId();
  const ticketCode = newTicketCode();

  const row = await queryOne<{
    trck_user_id: string;
    ticket_code: string | null;
  }>(
    `insert into visitors (
       trck_user_id, ticket_code,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       ip, user_agent, external_id_hash
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (trck_user_id) do update set
       ticket_code = coalesce(visitors.ticket_code, excluded.ticket_code),
       utm_source = coalesce(excluded.utm_source, visitors.utm_source),
       utm_medium = coalesce(excluded.utm_medium, visitors.utm_medium),
       utm_campaign = coalesce(excluded.utm_campaign, visitors.utm_campaign),
       utm_term = coalesce(excluded.utm_term, visitors.utm_term),
       utm_content = coalesce(excluded.utm_content, visitors.utm_content),
       ip = coalesce(excluded.ip, visitors.ip),
       user_agent = coalesce(excluded.user_agent, visitors.user_agent),
       updated_at = now()
     returning trck_user_id, ticket_code`,
    [
      trckUserId,
      ticketCode,
      opts.link.utm_source,
      opts.link.utm_medium,
      opts.link.utm_campaign,
      opts.link.utm_term,
      opts.link.utm_content,
      opts.ip ?? null,
      opts.userAgent ?? null,
      hashPii(trckUserId),
    ]
  );

  let code = row?.ticket_code ?? null;
  if (!code) {
    const filled = await queryOne<{ ticket_code: string }>(
      `update visitors set ticket_code = $2, updated_at = now()
       where trck_user_id = $1 and ticket_code is null
       returning ticket_code`,
      [trckUserId, newTicketCode()]
    );
    code = filled?.ticket_code ?? ticketCode;
  }

  return { trckUserId, ticketCode: code };
}

export function buildWhatsappDestinationUrl(
  link: TrackedLinkRow,
  ticketCode: string
): string {
  const text = appendOrReplaceTicket(link.message_template || "", ticketCode);
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  return `https://wa.me/${link.phone_digits}?${params.toString()}`;
}
