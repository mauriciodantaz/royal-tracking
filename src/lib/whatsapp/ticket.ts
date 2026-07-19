/** WhatsApp ticket tag: always `[rt:CODE]` at the end of the message. */

export const TICKET_PREFIX = "rt";

/** `[rt:xK9m2pQ7]` — short code only. */
export const TICKET_LINE_RE = /\[rt:([A-Za-z0-9_-]{6,32})\]/;

export type ParsedTicket = {
  name: typeof TICKET_PREFIX;
  value: string;
};

export function parseTicket(text: string): ParsedTicket | null {
  const m = TICKET_LINE_RE.exec(text);
  const value = m?.[1]?.trim();
  if (!value) return null;
  return { name: TICKET_PREFIX, value };
}

export function formatTicketLine(value: string): string {
  return `[${TICKET_PREFIX}:${value}]`;
}

/** Ensure message body ends with `[rt:code]` (replace existing tag if present). */
export function appendOrReplaceTicket(message: string, value: string): string {
  const line = formatTicketLine(value);
  const base = message.replace(TICKET_LINE_RE, "").replace(/\s+$/g, "");
  if (!base) return line;
  return `${base}\n\n${line}`;
}
