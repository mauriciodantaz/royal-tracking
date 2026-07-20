import "server-only";

import { query } from "@/lib/db/pool";
import {
  resolveGaIdentity,
  type ResolveGaIdentityInput,
  type ResolveGaIdentityResult,
} from "@/lib/tracking/ga-client-id";

/**
 * Resolve GA4 identity and persist onto visitors when needed
 * (new id, source, browser_ga on mismatch, timestamps).
 */
export async function resolveAndPersistGaIdentity(
  input: ResolveGaIdentityInput
): Promise<ResolveGaIdentityResult> {
  const resolved = resolveGaIdentity(input);
  const trck = input.trckUserId?.trim();
  if (!trck) return resolved;

  const shouldPersistIdentity =
    resolved.persist && resolved.clientId && resolved.source !== "none";
  const shouldPersistBrowserGa =
    resolved.identityMismatch && resolved.browserGaClientId;

  if (!shouldPersistIdentity && !shouldPersistBrowserGa) {
    return resolved;
  }

  if (shouldPersistIdentity && resolved.clientId) {
    await query(
      `update visitors set
         ga_client_id = $2,
         ga_client_id_source = $3,
         browser_ga_client_id = coalesce($4, browser_ga_client_id),
         ga_client_id_created_at = coalesce(ga_client_id_created_at, now()),
         ga_client_id_updated_at = now(),
         updated_at = now()
       where trck_user_id = $1`,
      [
        trck,
        resolved.clientId,
        resolved.source,
        shouldPersistBrowserGa ? resolved.browserGaClientId : null,
      ]
    );
  } else if (shouldPersistBrowserGa) {
    await query(
      `update visitors set
         browser_ga_client_id = $2,
         ga_client_id_updated_at = now(),
         updated_at = now()
       where trck_user_id = $1`,
      [trck, resolved.browserGaClientId]
    );
  }

  return resolved;
}

/** @deprecated Prefer resolveAndPersistGaIdentity */
export async function resolveAndPersistGaClientId(input: {
  fromCookie?: string | null;
  stored?: string | null;
  trckUserId?: string | null;
  fromRtFpid?: string | null;
  visitorCreatedAt?: string | Date | null;
  storedSource?: string | null;
  storedBrowserGa?: string | null;
}): Promise<ResolveGaIdentityResult> {
  return resolveAndPersistGaIdentity({
    fromBrowserGa: input.fromCookie,
    fromRtFpid: input.fromRtFpid,
    storedClientId: input.stored,
    storedSource: input.storedSource,
    storedBrowserGa: input.storedBrowserGa,
    trckUserId: input.trckUserId,
    visitorCreatedAt: input.visitorCreatedAt,
  });
}
