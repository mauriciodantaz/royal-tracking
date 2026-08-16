import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENTS_PAGE_SIZE } from "@/lib/dashboard/list-events-query";
import { listRecentEvents } from "@/lib/dashboard/list-recent-events";
import { EventsTable, type EventRow } from "./events-table";

export default async function EventosPage() {
  let events: EventRow[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const page = await listRecentEvents({ limit: EVENTS_PAGE_SIZE });
    events = page.events;
    nextCursor = page.nextCursor;
  } catch (e) {
    console.error("[dashboard/eventos]", e);
    error = "Não foi possível carregar os eventos.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Histórico completo — {EVENTS_PAGE_SIZE} por página. Origem é a
          plataforma que gerou o evento (Snippet, RD Station CRM, Pipedrive…).
          Atualiza ao vivo. Metadados não expiram; payloads JSON só são limpos
          após 14 dias se o operador agendar o purge.
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
            <EventsTable events={events} nextCursor={nextCursor} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
