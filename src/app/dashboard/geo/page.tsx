import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoMap } from "@/components/dashboard/geo-map";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";

export default async function GeoPage() {
  let points: Array<{ country: string; count: number }> = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<{ geo_country: string | null }>(
      `select geo_country from visitors where geo_country is not null`
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      const c = row.geo_country;
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    points = [...map.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Geo</h1>
        <p className="text-sm text-muted-foreground">
          Distribuição por país (geo do IP na captura)
        </p>
      </div>
      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Mapa</CardTitle>
          </CardHeader>
          <CardContent>
            <GeoMap points={points} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
