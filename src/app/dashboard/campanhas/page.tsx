import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import { getAdsInsightsTree } from "@/lib/meta/ads-insights";
import { CampaignsView } from "./campaigns-view";

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; refresh?: string }>;
}) {
  const params = await searchParams;
  let error: string | null = null;
  let accounts: Array<{ id: string; label: string }> = [];
  let trees: Awaited<ReturnType<typeof getAdsInsightsTree>> = [];

  try {
    await ensureDbReady();
    const result = await query<{ id: string; label: string }>(
      `select id, label from meta_ad_accounts where active = true`
    );
    accounts = result.rows;
    trees = await getAdsInsightsTree({
      accountId: params.account,
      force: params.refresh === "1",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-sm text-muted-foreground">
          Insights Meta Ads × receita por UTM (ROAS/CPA). Cache 30 min + rate
          limit conservador.
        </p>
      </div>
      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">
              Árvore campanha → conjunto → anúncio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm">Carregando…</p>}>
              <CampaignsView accounts={accounts} trees={trees} />
            </Suspense>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
