/** Parse / format short WhatsApp ticket tags: `[name:code]`. */

/** Legacy: `[ticket=name:value]` — still accepted on inbound. */
export const TICKET_LEGACY_RE = /\[ticket=([^\]:\s]+):([^\]]+)\]/i;

/** Pretty short tag: `[rt:xK9m2pQ7]` (name + short code only). */
export const TICKET_SHORT_RE = /\[([a-z0-9]{1,48}):([A-Za-z0-9_-]{6,32})\]/;

export const TICKET_LINE_RE = TICKET_LEGACY_RE;

export type ParsedTicket = {
  name: string;
  value: string;
};

export function parseTicket(text: string): ParsedTicket | null {
  const legacy = TICKET_LEGACY_RE.exec(text);
  if (legacy) {
    const name = legacy[1]?.trim();
    const value = legacy[2]?.trim();
    if (name && value) return { name, value };
  }

  const short = TICKET_SHORT_RE.exec(text);
  if (short) {
    const name = short[1]?.trim();
    const value = short[2]?.trim();
    if (name && value) return { name, value };
  }

  return null;
}

/** Pretty ticket line for visitor messages — no "ticket=" spam. */
export function formatTicketLine(name: string, value: string): string {
  return `[${name}:${value}]`;
}

/** Slug for ticket name from PROJECT_NAME or connection config. */
export function slugTicketName(raw: string | null | undefined): string {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  return s || "rt";
}

/**
 * Coalesce tracking value for the ticket (encode).
 * Prefer stable join key first.
 */
export function coalesceTrackingValue(ids: {
  ticket_code?: string | null;
  trck_user_id?: string | null;
  fbp?: string | null;
  ga_client_id?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
}): string | null {
  const order = [
    ids.ticket_code,
    ids.trck_user_id,
    ids.fbp,
    ids.ga_client_id,
    ids.gclid,
    ids.ttclid,
  ];
  for (const v of order) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return null;
}

/** Ensure message body ends with a ticket line (replace existing if present). */
export function appendOrReplaceTicket(
  message: string,
  name: string,
  value: string
): string {
  const line = formatTicketLine(name, value);
  const base = message
    .replace(TICKET_LEGACY_RE, "")
    .replace(TICKET_SHORT_RE, "")
    .replace(/\s+$/g, "");
  if (!base) return line;
  return `${base}\n\n${line}`;
}
