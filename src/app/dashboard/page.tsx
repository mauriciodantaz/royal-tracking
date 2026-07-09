import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventsBarChart } from "@/components/dashboard/events-chart";
import { FunnelVisual } from "@/components/dashboard/funnel";
import { getOverviewMetrics } from "@/lib/dashboard/metrics";

export default async function DashboardPage() {
  let metrics = null as Awaited<ReturnType<typeof getOverviewMetrics>> | null;
  let error: string | null = null;

  try {
    metrics = await getOverviewMetrics();
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar métricas";
  }

  const cards = [
    {
      title: "Usuários únicos",
      value: metrics?.uniqueVisitors ?? "—",
    },
    {
      title: "Compras",
      value: metrics?.purchases ?? "—",
    },
    {
      title: "Conversão",
      value:
        metrics != null ? `${metrics.conversionRate.toFixed(2)}%` : "—",
    },
    {
      title: "Tipos de evento",
      value: metrics?.eventsByType.length ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Funil Visitou → Checkout → Compra
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}. Aplique a migration e configure SERVICE_ROLE_KEY.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => (
          <Card key={item.title} className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl tabular-nums">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Eventos por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <EventsBarChart data={metrics?.eventsByType ?? []} />
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Funil</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics ? (
              <FunnelVisual
                visited={metrics.funnel.visited}
                checkout={metrics.funnel.checkout}
                purchase={metrics.funnel.purchase}
                visitToCheckout={metrics.funnel.visitToCheckout}
                checkoutToPurchase={metrics.funnel.checkoutToPurchase}
              />
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
