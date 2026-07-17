import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentEvents } from "@/lib/dashboard/list-recent-events";
import { EventsTable, type EventRow } from "./events-table";

export default async function EventosPage() {
  let events: EventRow[] = [];
  let error: string | null = null;

  try {
    events = await listRecentEvents(200);
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 200 — plataformas (Meta/GA4), canal web/server e origem.
          Atualiza ao vivo sem recarregar a página.
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
