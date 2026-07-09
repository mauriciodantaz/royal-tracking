import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLACEHOLDERS = [
  { title: "Usuários únicos", value: "—" },
  { title: "Eventos", value: "—" },
  { title: "Compras", value: "—" },
  { title: "Conversão", value: "—" },
] as const;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Métricas do funil — dados na Fase 5.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PLACEHOLDERS.map((item) => (
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
    </div>
  );
}
