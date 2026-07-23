/**
 * Convenções de campos hidden preenchidos pelo snippet (Elementor popup → WA).
 * Mantém a mesma regra de nomes usada em public/snippet.js (fillTrackingFields).
 */

const TICKET_KEYS = new Set(["rt_ticket", "trck_ticket"]);

/** Elementor: form_fields[rt_ticket] / form-field-rt_ticket → rt_ticket */
export function normalizeFormFieldKey(raw: string): string {
  const s = String(raw || "").trim();
  const bracket = /^form_fields\[([^\]]+)\]$/i.exec(s);
  if (bracket?.[1]) return bracket[1].toLowerCase();
  return s.replace(/^form-field-/i, "").toLowerCase();
}

export function isTrackingTicketField(opts: {
  name?: string | null;
  id?: string | null;
  dataTrck?: string | null;
  className?: string | null;
}): boolean {
  if (opts.dataTrck === "ticket") return true;
  if (
    opts.className &&
    opts.className.split(/\s+/).includes("trck-ticket")
  ) {
    return true;
  }
  const name = normalizeFormFieldKey(opts.name || "");
  const id = normalizeFormFieldKey(opts.id || "");
  return TICKET_KEYS.has(name) || TICKET_KEYS.has(id);
}

export function isTrckUserIdField(opts: {
  name?: string | null;
  id?: string | null;
  dataTrck?: string | null;
}): boolean {
  if (opts.dataTrck === "user_id") return true;
  const name = normalizeFormFieldKey(opts.name || "");
  const id = normalizeFormFieldKey(opts.id || "");
  return name === "trck_user_id" || id === "trck_user_id";
}

export function formatTicketFieldValue(ticketCode: string): string {
  return `[rt:${ticketCode}]`;
}
