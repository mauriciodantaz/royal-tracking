import "server-only";

import { query } from "@/lib/db/pool";
import {
  resolveGaClientId,
  type ResolveGaClientIdInput,
  type ResolveGaClientIdResult,
} from "@/lib/tracking/ga-client-id";

/**
 * Resolve GA4 client_id and persist onto visitors when needed
 * (cookie overwrite, or synthetic fill when null).
 */
export async function resolveAndPersistGaClientId(
  input: ResolveGaClientIdInput
): Promise<ResolveGaClientIdResult> {
  const resolved = resolveGaClientId(input);
  const trck = input.trckUserId?.trim();
  if (!resolved.persist || !resolved.clientId || !trck) {
    return resolved;
  }

  if (resolved.source === "cookie") {
    await query(
      `update visitors
         set ga_client_id = $2, updated_at = now()
       where trck_user_id = $1`,
      [trck, resolved.clientId]
    );
  } else {
    await query(
      `update visitors
         set ga_client_id = $2, updated_at = now()
       where trck_user_id = $1 and ga_client_id is null`,
      [trck, resolved.clientId]
    );
  }

  return resolved;
}
