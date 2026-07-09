import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Public list of active GA4 measurement IDs for dynamic gtag (no secrets). */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ga4_accounts")
      .select("measurement_id")
      .eq("active", true);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      measurement_ids: (data ?? []).map((d) => d.measurement_id),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
