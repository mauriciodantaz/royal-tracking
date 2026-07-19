import { Card, CardContent } from "@/components/ui/card";
import {
  ActiveIntegrationsList,
  ModuleGallery,
} from "@/app/dashboard/integracoes/hub-client";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  isUiVisibleProvider,
  listUiModules,
} from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  let connections: IntegrationConnectionRow[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const c = await query<IntegrationConnectionRow>(
      `select * from integration_connections
       where provider <> 'snippet' or active = true
       order by active desc, provider, label`
    );
    connections = c.rows.filter(
      (row) => row.provider !== "snippet" || row.active
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar integrações";
  }

  const visibleConnections = connections.filter((c) =>
    isUiVisibleProvider(c.provider)
  );
  const active = visibleConnections.filter(
    (c) => c.provider !== "snippet" || c.active
  );
  const connectedCounts: Record<string, number> = {};
  for (const c of visibleConnections) {
    connectedCounts[c.provider] = (connectedCounts[c.provider] ?? 0) + 1;
  }
  const uiModules = listUiModules();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Conexões ativas e módulos disponíveis para captar e disparar eventos.
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-medium">Conectadas e operando</h2>
              <p className="text-sm text-muted-foreground">
                Integrações já configuradas neste ambiente.
              </p>
            </div>
            <ActiveIntegrationsList
              connections={active.map((c) => ({
                id: c.id,
                provider: c.provider,
                label: c.label,
                active: c.active,
                direction: c.direction,
                account_external_id: c.account_external_id,
              }))}
            />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-medium">Galeria de módulos</h2>
              <p className="text-sm text-muted-foreground">
                Escolha uma plataforma para adicionar credenciais ou outra conta.
              </p>
            </div>
            <ModuleGallery
              modules={uiModules.map((m) => ({
                provider: m.provider,
                name: m.name,
                description: m.description,
                direction: m.direction,
              }))}
              connectedCounts={connectedCounts}
            />
          </section>
        </>
      )}
    </div>
  );
}
