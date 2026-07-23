import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventsBarChart } from "@/components/dashboard/events-chart";
import { FunnelVisual } from "@/components/dashboard/funnel";
import {
  getOverviewMetrics,
  getVolumeMetrics,
  getWhatsappQualityMetrics,
  parseVolumeRange,
  type VolumeRange,
} from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";

const RANGES: Array<{ id: VolumeRange; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = parseVolumeRange(sp.range);

  let metrics = null as Awaited<ReturnType<typeof getOverviewMetrics>> | null;
  let volume = null as Awaited<ReturnType<typeof getVolumeMetrics>> | null;
  let waQuality = null as Awaited<
    ReturnType<typeof getWhatsappQualityMetrics>
  > | null;
  let error: string | null = null;

  try {
    [metrics, volume, waQuality] = await Promise.all([
      getOverviewMetrics(),
      getVolumeMetrics(range),
      getWhatsappQualityMetrics(range),
    ]);
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

  const channelCards = volume
    ? [
        {
          title: "Web + server",
          value: volume.webServer,
          hint: "Deduplicados nos destinos",
        },
        {
          title: "Só server",
          value: volume.serverOnly,
          hint: "Recuperados sem pixel web",
        },
        {
          title: "Só web",
          value: volume.webOnly,
          hint: "Pixel ok, server falhou",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            Volume processado e funil Visitou → Checkout → Compra
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={r.id === "7d" ? "/dashboard" : `/dashboard?range=${r.id}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === r.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}. Verifique a conexão com o banco de dados e se a instalação
            foi concluída.
          </CardContent>
        </Card>
      ) : null}

      {volume ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">Volume e recuperação</h2>
            <p className="text-xs text-muted-foreground">
              Período {range}. “Perda sem plataforma” = eventos que chegaram só
              pelo server (adblock/ITP/falha browser ou webhook) — o pixel web
              sozinho não os teria capturado.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Eventos processados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl tabular-nums">{volume.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cobertura server: {volume.serverCoveragePct.toFixed(1)}%
                  {volume.unknown > 0
                    ? ` · ${volume.unknown} legado sem canal`
                    : null}
                </p>
              </CardContent>
            </Card>

            <Card className="glass border-foreground/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Perda sem a plataforma
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl tabular-nums">
                  {volume.lossWithoutPlatformPct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {volume.lossWithoutPlatformCount} eventos só via server — não
                  teriam sido capturados só com pixel web
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {channelCards.map((item) => (
              <Card key={item.title} className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl tabular-nums">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Por tipo de evento</CardTitle>
              </CardHeader>
              <CardContent>
                {volume.byEvent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum evento no período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Evento</th>
                          <th className="pb-2 font-medium tabular-nums">Total</th>
                          <th className="pb-2 font-medium tabular-nums">W+S</th>
                          <th className="pb-2 font-medium tabular-nums">Server</th>
                          <th className="pb-2 font-medium tabular-nums">Web</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volume.byEvent.map((row) => (
                          <tr
                            key={row.name}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="py-2 font-medium">{row.name}</td>
                            <td className="py-2 font-mono tabular-nums">
                              {row.total}
                            </td>
                            <td className="py-2 font-mono tabular-nums text-muted-foreground">
                              {row.webServer}
                            </td>
                            <td className="py-2 font-mono tabular-nums text-muted-foreground">
                              {row.serverOnly}
                            </td>
                            <td className="py-2 font-mono tabular-nums text-muted-foreground">
                              {row.webOnly}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Por destino</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Meta</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    web {volume.byDestination.meta.web} · server{" "}
                    {volume.byDestination.meta.server} · só server{" "}
                    {volume.byDestination.meta.serverOnlyPct.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">GA4</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    web {volume.byDestination.ga4.web} · server{" "}
                    {volume.byDestination.ga4.server} · só server{" "}
                    {volume.byDestination.ga4.serverOnlyPct.toFixed(1)}%
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  % só server por destino = eventos com server ok e web falhou
                  nesse canal (inclui webhooks).
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      {waQuality ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">Qualidade WhatsApp</h2>
            <p className="text-xs text-muted-foreground">
              Leads inbound (Evolution / UazAPI / RD Conversas) no período{" "}
              {range}. Ticket = site→WA; CTWA = anúncio→WhatsApp com{" "}
              <code className="text-[10px]">ctwa_clid</code>.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Leads WA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">
                  {waQuality.total}
                </p>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Com ticket
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">
                  {waQuality.withTicketPct.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Com CTWA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">
                  {waQuality.withCtwaPct.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Match / unmatched
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">
                  {waQuality.matchedPct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  unmatched {waQuality.unmatchedPct.toFixed(1)}% · gclid{" "}
                  {waQuality.withGclidPct.toFixed(1)}% · fbc{" "}
                  {waQuality.withFbcPct.toFixed(1)}%
                  {waQuality.avgSecondsIdentifyToLead != null
                    ? ` · Δ visitor→lead ${Math.round(waQuality.avgSecondsIdentifyToLead)}s`
                    : null}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
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
