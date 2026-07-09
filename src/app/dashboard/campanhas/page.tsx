import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CampanhasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-sm text-muted-foreground">
          Insights Meta Ads × receita UTM (ROAS/CPA) — Fase 6.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Árvore campanha → anúncio</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder. Cache e rate limit conservador na Fase 6.
        </CardContent>
      </Card>
    </div>
  );
}
