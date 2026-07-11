import { corsPreflight, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";

export const runtime = "nodejs";

export function OPTIONS() {
  return corsPreflight();
}

/** Public list of active GA4 measurement IDs for dynamic gtag (no secrets). */
export async function GET() {
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
    return jsonCors({
      measurement_ids: ids,
    });
  } catch (e) {
    return jsonCors(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
