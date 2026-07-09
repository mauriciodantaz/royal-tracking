/**
 * Append trck_user_id to checkout / WhatsApp URLs for cross-domain linking.
 */
export function withTrckUserId(url: string, trckUserId: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("trck_user_id", trckUserId);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}trck_user_id=${encodeURIComponent(trckUserId)}`;
  }
}

export function buildWhatsAppLink(opts: {
  phoneE164: string;
  text: string;
  trckUserId: string;
}): string {
  const base = `https://wa.me/${opts.phoneE164.replace(/\D/g, "")}`;
  const text = `${opts.text}\n\n[ref:${opts.trckUserId}]`;
  return `${base}?text=${encodeURIComponent(text)}`;
}
