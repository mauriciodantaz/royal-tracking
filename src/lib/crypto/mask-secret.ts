const BULLET = "•";

/**
 * Server-side preview for stored secrets. Never send the plaintext to the client;
 * only this masked form.
 *
 * - empty → ""
 * - length ≤ 10 → all bullets (avoids revealing short secrets)
 * - length > 10 → first 5 + bullets for the middle + last 5
 */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  const len = plain.length;
  if (len <= 10) return BULLET.repeat(len);
  return `${plain.slice(0, 5)}${BULLET.repeat(len - 10)}${plain.slice(-5)}`;
}

/**
 * True when a submitted value looks like our mask preview (defense: never
 * encrypt a pasted/submitted mask as if it were a new secret).
 */
export function looksLikeMaskedSecret(value: string): boolean {
  if (!value) return false;
  if (!value.includes(BULLET)) return false;
  // All bullets (short-secret preview)
  if (/^•+$/u.test(value)) return true;
  // tip + bullets + tail (at least one bullet in the middle)
  return /^.{1,5}•+.{1,5}$/u.test(value);
}
