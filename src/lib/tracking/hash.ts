import { createHash, randomUUID } from "node:crypto";

/** SHA-256 hex of normalized string (Meta CAPI PII rules). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only for phone hashing. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return sha256(normalizeEmail(email));
}

export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return sha256(digits);
}

export function hashPii(value: string | null | undefined): string | null {
  if (!value) return null;
  const n = normalizeName(value);
  if (!n) return null;
  return sha256(n);
}

export function newTrckUserId(): string {
  return `trck_${randomUUID().replace(/-/g, "")}`;
}

export function newEventId(): string {
  return randomUUID();
}

/** Purchase event_id derived from transaction_id for Meta dedup. */
export function purchaseEventId(transactionId: string): string {
  return sha256(`purchase:${transactionId}`);
}
