import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CampanhasTreeSkeleton } from "./campaigns-skeleton";

export default function CampanhasLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-sm text-muted-foreground">
          Insights Meta Ads × receita por UTM (ROAS/CPA). Cache 30 min + rate
          limit conservador.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">
            Árvore campanha → conjunto → anúncio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CampanhasTreeSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
