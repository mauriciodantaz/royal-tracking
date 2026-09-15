import { Card, CardContent } from "@/components/ui/card";
import { EVENTS_PAGE_SIZE } from "@/lib/dashboard/list-events-query";
import { listRecentEvents } from "@/lib/dashboard/list-recent-events";
import { listCustomEvents } from "@/lib/tracking/custom-events";

import type { CustomEventListItem } from "./custom-events-panel";
import { EventsPageClient } from "./events-page-client";
import type { EventRow } from "./events-table";

export default async function EventosPage() {
  let events: EventRow[] = [];
  let nextCursor: string | null = null;
  let customEvents: CustomEventListItem[] = [];
  let error: string | null = null;

  try {
    const [page, catalog] = await Promise.all([
      listRecentEvents({ limit: EVENTS_PAGE_SIZE }),
      listCustomEvents(),
    ]);
    events = page.events;
    nextCursor = page.nextCursor;
    customEvents = catalog;
  } catch (e) {
    console.error("[dashboard/eventos]", e);
    error = "Não foi possível carregar os eventos.";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        </div>
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <EventsPageClient
      events={events}
      nextCursor={nextCursor}
      customEvents={customEvents}
    />
  );
}
