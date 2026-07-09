import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração</h1>
        <p className="text-sm text-muted-foreground">
          Settings, pixels, GA4 e contas de anúncio — Fase 4.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Credenciais multi-conta</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder. CRUD com segredos cifrados e “Testar conexão” na Fase 4.
        </CardContent>
      </Card>
    </div>
  );
}
