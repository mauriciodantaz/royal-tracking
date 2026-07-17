import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { EventsTable, type EventRow } from "./events-table";

export default async function EventosPage() {
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<EventRow>(
      `select id, event_name, event_id, trck_user_id, utm_source, utm_campaign,
              geo_country, geo_city, created_at, payload_meta, response_meta,
              payload_ga4, response_ga4,
              ingest_path, channel_class, web_meta, web_ga4, server_meta, server_ga4
       from events_log
       order by created_at desc
       limit 200`
    );
    events = result.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 200 — plataformas (Meta/GA4), canal web/server e origem.
        </p>
      </div>
      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <EventsTable events={events} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
