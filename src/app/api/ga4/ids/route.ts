import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { logAndPublicError, publicErrorBody } from "@/lib/http/public-error";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/tracking/request";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

/** Public list of active GA4 measurement IDs for dynamic gtag (no secrets). */
export async function GET(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`ga4-ids:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return jsonCors(publicErrorBody("rate_limited"), { status: 429 }, request);
  }

  try {
    await ensureDbReady();
    const result = await query<{ measurement_id: string }>(
      `select coalesce(config->>'measurement_id', account_external_id) as measurement_id
       from integration_connections
       where provider = 'ga4' and active = true`
    );
    let ids = result.rows.map((d) => d.measurement_id).filter(Boolean);
    if (ids.length === 0) {
      const legacy = await query<{ measurement_id: string }>(
        `select measurement_id from ga4_accounts where active = true`
      );
      ids = legacy.rows.map((d) => d.measurement_id);
    }
    return jsonCors(
      {
        measurement_ids: ids,
      },
      undefined,
      request
    );
  } catch (e) {
    logAndPublicError("api/ga4/ids", e);
    return jsonCors(publicErrorBody("internal"), { status: 500 }, request);
  }
}
