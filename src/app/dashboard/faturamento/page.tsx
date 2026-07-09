import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FaturamentoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Receita, ticket médio e reembolsos — Fase 5.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Compras</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder. Webhook na Fase 3; métricas na Fase 5.
        </CardContent>
      </Card>
    </div>
  );
}
