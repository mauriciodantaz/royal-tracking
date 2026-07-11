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
      `select measurement_id from ga4_accounts where active = true`
    );
    return jsonCors({
      measurement_ids: result.rows.map((d) => d.measurement_id),
    });
  } catch (e) {
    return jsonCors(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
