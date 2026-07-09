import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GeoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Geo</h1>
        <p className="text-sm text-muted-foreground">
          Mapa por região a partir do IP — Fase 6.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Mapa</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder. react-simple-maps na Fase 6.
        </CardContent>
      </Card>
    </div>
  );
}
