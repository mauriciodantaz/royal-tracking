import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EventosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Log filtrável com payloads Meta/GA4 — Fase 5.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Tabela de eventos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder. Captura chega na Fase 2; UI completa na Fase 5.
        </CardContent>
      </Card>
    </div>
  );
}
