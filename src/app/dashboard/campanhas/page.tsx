import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { getAdsInsightsTree } from "@/lib/meta/ads-insights";

import { CampaignsView } from "./campaigns-view";
import { CampanhasTreeSkeleton } from "./campaigns-skeleton";

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; refresh?: string }>;
}) {
  const params = await searchParams;
  const suspenseKey = `${params.account ?? "all"}:${params.refresh ?? "0"}`;

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
          <Suspense key={suspenseKey} fallback={<CampanhasTreeSkeleton />}>
            <CampaignsData
              accountId={params.account}
              force={params.refresh === "1"}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function CampaignsData({
  accountId,
  force,
}: {
  accountId?: string;
  force: boolean;
}) {
  try {
    await ensureDbReady();
    const result = await query<{ id: string; label: string }>(
      `select id, label from meta_ad_accounts where active = true`
    );
    const trees = await getAdsInsightsTree({
      accountId,
      force,
    });
    return <CampaignsView accounts={result.rows} trees={trees} />;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro";
    return <p className="text-sm text-destructive">{message}</p>;
  }
}
