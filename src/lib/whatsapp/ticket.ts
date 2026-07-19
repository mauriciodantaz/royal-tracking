/** Parse / format `[ticket=name:value]` in WhatsApp message text. */

export const TICKET_LINE_RE = /\[ticket=([^\]:\s]+):([^\]]+)\]/i;

export type ParsedTicket = {
  name: string;
  value: string;
};

export function parseTicket(text: string): ParsedTicket | null {
  const m = TICKET_LINE_RE.exec(text);
  if (!m) return null;
  const name = m[1]?.trim();
  const value = m[2]?.trim();
  if (!name || !value) return null;
  return { name, value };
}

export function formatTicketLine(name: string, value: string): string {
  return `[ticket=${name}:${value}]`;
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
  trck_user_id?: string | null;
  fbp?: string | null;
  ga_client_id?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
}): string | null {
  const order = [
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
  const base = message.replace(TICKET_LINE_RE, "").replace(/\s+$/g, "");
  if (!base) return line;
  return `${base}\n\n${line}`;
}
