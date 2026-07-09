import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventsTable, type EventRow } from "./events-table";

export default async function EventosPage() {
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error: qErr } = await admin
      .from("events_log")
      .select(
        "id, event_name, event_id, trck_user_id, utm_source, utm_campaign, geo_country, geo_city, created_at, payload_meta, response_meta, payload_ga4, response_ga4"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (qErr) throw qErr;
    events = (data ?? []) as EventRow[];
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 200 — filtre e abra payload/response Meta e GA4.
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
