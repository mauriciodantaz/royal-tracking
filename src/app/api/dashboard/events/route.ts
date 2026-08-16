import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listRecentEvents } from "@/lib/dashboard/list-recent-events";
import {
  EVENTS_PAGE_SIZE,
  decodeEventCursor,
} from "@/lib/dashboard/list-events-query";
import { publicErrorBody } from "@/lib/http/public-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(publicErrorBody("unauthorized"), { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const cursor = decodeEventCursor(url.searchParams.get("cursor"));
  const limitRaw = url.searchParams.get("limit");
  const parsedLimit = limitRaw != null ? Number(limitRaw) : EVENTS_PAGE_SIZE;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : EVENTS_PAGE_SIZE;

  try {
    const page = await listRecentEvents({
      limit,
      cursor,
      q,
    });
    return NextResponse.json(page);
  } catch (e) {
    console.error("[dashboard/events]", e);
    return NextResponse.json(publicErrorBody("internal"), { status: 500 });
  }
}
