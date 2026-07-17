import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listRecentEvents } from "@/lib/dashboard/list-recent-events";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const events = await listRecentEvents(200);
    return NextResponse.json({ events });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
