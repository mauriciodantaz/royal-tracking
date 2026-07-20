import { createHmac, createHash, randomBytes } from "node:crypto";

export const RT_FPID_COOKIE = "_rt_fpid";

export type GaClientIdSource =
  | "ga_cookie"
  | "royal_fpid"
  | "visitor_stored"
  | "synthetic_trck"
  | "generated"
  | "none";

export type ResolveGaIdentityInput = {
  /** Normalized or raw `_ga` / body `ga_client_id` from the browser. */
  fromBrowserGa?: string | null;
  /** Value of HttpOnly `_rt_fpid` cookie on the Royal host. */
  fromRtFpid?: string | null;
  /** Persisted Measurement Protocol client_id. */
  storedClientId?: string | null;
  storedSource?: string | null;
  storedBrowserGa?: string | null;
  trckUserId?: string | null;
  /** Visitor row created_at (ISO). Used as the second segment of synthetic/generated IDs. */
  visitorCreatedAt?: string | Date | null;
  /** Override secret (tests). Defaults to GA_CLIENT_ID_SECRET || ENCRYPTION_KEY. */
  hmacSecret?: string | null;
};

export type GaIdentityMeta = {
  ga_client_id_source: GaClientIdSource;
  ga_client_id_resolution: GaClientIdSource;
  ga_client_id_persisted: boolean;
  ga_client_id_cookie_written: boolean;
  browser_ga_client_id_present: boolean;
  ga_identity_mismatch: boolean;
  /** Short hash for logs — never the full client_id. */
  ga_client_id_mask: string | null;
};

export type ResolveGaIdentityResult = {
  clientId: string | null;
  source: GaClientIdSource;
  /** Persist `clientId` + source onto visitors. */
  persist: boolean;
  /** Emit Set-Cookie `_rt_fpid`. */
  writeCookie: boolean;
  /** Browser `_ga` differed from sticky server-managed id. */
  identityMismatch: boolean;
  /** Value to store in `browser_ga_client_id` (may be null). */
  browserGaClientId: string | null;
  meta: GaIdentityMeta;
};

/** @deprecated Use GaClientIdSource — kept for outbound aliasing during transition. */
export type ResolveGaClientIdInput = {
  fromCookie?: string | null;
  stored?: string | null;
  trckUserId?: string | null;
};

function getHmacSecret(override?: string | null): string | null {
  const s =
    override?.trim() ||
    process.env.GA_CLIENT_ID_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    "";
  return s || null;
}

export function normalizeGaClientId(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length >= 4 && /^GA\d+$/i.test(parts[0] ?? "")) {
    return `${parts[2]}.${parts[3]}`;
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[0]}.${parts[1]}`;
  }
  return trimmed;
}

export function maskGaClientId(clientId: string | null | undefined): string | null {
  if (!clientId) return null;
  return createHash("sha256").update(clientId).digest("hex").slice(0, 8);
}

export function visitorCreatedAtUnix(
  createdAt: string | Date | null | undefined
): number {
  if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) {
    return Math.floor(createdAt.getTime() / 1000);
  }
  if (typeof createdAt === "string" && createdAt.trim()) {
    const ms = Date.parse(createdAt);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function hmacUint32(secret: string, trckUserId: string): number {
  const hex = createHmac("sha256", secret).update(trckUserId).digest("hex");
  return Number.parseInt(hex.slice(0, 8), 16) >>> 0;
}

/**
 * Deterministic GA4-style client_id from trck_user_id:
 * `{uint32(HMAC_SHA256(secret, trck))}.{visitor_created_at_unix}`.
 */
export function syntheticGaClientId(
  trckUserId: string,
  visitorCreatedAt?: string | Date | null,
  hmacSecret?: string | null
): string | null {
  const secret = getHmacSecret(hmacSecret);
  if (!secret) return null;
  const a = hmacUint32(secret, trckUserId);
  const b = visitorCreatedAtUnix(visitorCreatedAt);
  return `${a}.${b}`;
}

export function generatedGaClientId(
  visitorCreatedAt?: string | Date | null
): string {
  const a = randomBytes(4).readUInt32BE(0);
  const b = visitorCreatedAtUnix(visitorCreatedAt);
  return `${a}.${b}`;
}

function hasServerManagedIdentity(
  storedClientId: string | null,
  _storedSource: string | null
): boolean {
  return Boolean(storedClientId);
}

function buildMeta(
  partial: Omit<GaIdentityMeta, "ga_client_id_mask"> & {
    clientId: string | null;
  }
): GaIdentityMeta {
  return {
    ga_client_id_source: partial.ga_client_id_source,
    ga_client_id_resolution: partial.ga_client_id_resolution,
    ga_client_id_persisted: partial.ga_client_id_persisted,
    ga_client_id_cookie_written: partial.ga_client_id_cookie_written,
    browser_ga_client_id_present: partial.browser_ga_client_id_present,
    ga_identity_mismatch: partial.ga_identity_mismatch,
    ga_client_id_mask: maskGaClientId(partial.clientId),
  };
}

/**
 * Resolve GA4 Measurement Protocol client_id (Stape/FPID-style):
 * ga_cookie (only if no server-managed) → royal_fpid → visitor_stored →
 * synthetic_trck → generated → none.
 */
export function resolveGaIdentity(
  input: ResolveGaIdentityInput
): ResolveGaIdentityResult {
  const fromBrowserGa = normalizeGaClientId(input.fromBrowserGa);
  const fromRtFpid = normalizeGaClientId(input.fromRtFpid);
  const storedClientId = normalizeGaClientId(input.storedClientId);
  const storedBrowserGa = normalizeGaClientId(
    input.storedBrowserGa ?? undefined
  );
  const serverManaged = hasServerManagedIdentity(
    storedClientId,
    input.storedSource ?? null
  );
  const trck = input.trckUserId?.trim() || null;

  let identityMismatch = false;
  let browserGaClientId: string | null = storedBrowserGa;

  if (serverManaged && fromBrowserGa && fromBrowserGa !== storedClientId) {
    identityMismatch = true;
    browserGaClientId = fromBrowserGa;
  }

  const finish = (
    clientId: string | null,
    source: GaClientIdSource,
    opts: { persist: boolean; writeCookie: boolean }
  ): ResolveGaIdentityResult => {
    const meta = buildMeta({
      clientId,
      ga_client_id_source: source,
      ga_client_id_resolution: source,
      ga_client_id_persisted: opts.persist,
      ga_client_id_cookie_written: opts.writeCookie,
      browser_ga_client_id_present: Boolean(fromBrowserGa || browserGaClientId),
      ga_identity_mismatch: identityMismatch,
    });
    return {
      clientId,
      source,
      persist: opts.persist,
      writeCookie: opts.writeCookie,
      identityMismatch,
      browserGaClientId,
      meta,
    };
  };

  // 1. Browser `_ga` only when no server-managed identity yet
  if (fromBrowserGa && !serverManaged) {
    return finish(fromBrowserGa, "ga_cookie", {
      persist: true,
      writeCookie: true,
    });
  }

  // 2. Royal FPID cookie
  if (fromRtFpid) {
    const persist = !storedClientId || storedClientId !== fromRtFpid;
    return finish(fromRtFpid, "royal_fpid", {
      persist,
      writeCookie: false,
    });
  }

  // 3. Stored visitor id
  if (storedClientId) {
    return finish(storedClientId, "visitor_stored", {
      persist: identityMismatch, // persist browser_ga update
      writeCookie: true,
    });
  }

  // 4. HMAC synthetic from trck_user_id
  if (trck) {
    const synth = syntheticGaClientId(
      trck,
      input.visitorCreatedAt,
      input.hmacSecret
    );
    if (synth) {
      return finish(synth, "synthetic_trck", {
        persist: true,
        writeCookie: true,
      });
    }
    // 5. Generated when secret missing but trck exists
    return finish(generatedGaClientId(input.visitorCreatedAt), "generated", {
      persist: true,
      writeCookie: true,
    });
  }

  // 6. None
  return finish(null, "none", { persist: false, writeCookie: false });
}

/**
 * Legacy shim used by older call sites — prefers browser ga then stored then synthetic.
 * Prefer `resolveGaIdentity` for new code.
 */
export function resolveGaClientId(
  input: ResolveGaClientIdInput
): {
  clientId: string | null;
  source: GaClientIdSource;
  persist: boolean;
} {
  const r = resolveGaIdentity({
    fromBrowserGa: input.fromCookie,
    storedClientId: input.stored,
    trckUserId: input.trckUserId,
  });
  return { clientId: r.clientId, source: r.source, persist: r.persist };
}
