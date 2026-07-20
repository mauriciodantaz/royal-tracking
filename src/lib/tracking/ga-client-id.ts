import { createHash } from "node:crypto";

export type GaClientIdSource =
  | "cookie"
  | "visitor_stored"
  | "synthetic_trck"
  | "none";

export type ResolveGaClientIdInput = {
  fromCookie?: string | null;
  stored?: string | null;
  trckUserId?: string | null;
};

export type ResolveGaClientIdResult = {
  clientId: string | null;
  source: GaClientIdSource;
  /** True when callers should persist `clientId` onto the visitor row. */
  persist: boolean;
};

function normalizeClientId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept full `_ga` cookie value GA1.1.X.Y → X.Y
  const parts = trimmed.split(".");
  if (parts.length >= 4 && /^GA\d+$/i.test(parts[0] ?? "")) {
    return `${parts[2]}.${parts[3]}`;
  }
  return trimmed;
}

/**
 * Deterministic GA4-style client_id from trck_user_id (`{uint32}.{uint32}`).
 * Same trck_ ⇒ same client_id (Adblock / cookieless recovery).
 */
export function syntheticGaClientId(trckUserId: string): string {
  const hex = createHash("sha256").update(trckUserId).digest("hex");
  const a = Number.parseInt(hex.slice(0, 8), 16) >>> 0;
  const b = Number.parseInt(hex.slice(8, 16), 16) >>> 0;
  return `${a}.${b}`;
}

/**
 * Resolve Measurement Protocol client_id:
 * cookie `_ga` → visitors.ga_client_id → synthetic from trck_user_id → none.
 */
export function resolveGaClientId(
  input: ResolveGaClientIdInput
): ResolveGaClientIdResult {
  const fromCookie = normalizeClientId(input.fromCookie);
  if (fromCookie) {
    return { clientId: fromCookie, source: "cookie", persist: true };
  }

  const stored = normalizeClientId(input.stored);
  if (stored) {
    return { clientId: stored, source: "visitor_stored", persist: false };
  }

  const trck = input.trckUserId?.trim();
  if (trck) {
    return {
      clientId: syntheticGaClientId(trck),
      source: "synthetic_trck",
      persist: true,
    };
  }

  return { clientId: null, source: "none", persist: false };
}
