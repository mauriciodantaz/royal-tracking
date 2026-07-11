import { Card, CardContent } from "@/components/ui/card";
import { IntegrationsHub } from "@/app/dashboard/integracoes/hub-client";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type {
  IntegrationConnectionRow,
  IntegrationEventMappingRow,
} from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import { INTEGRATION_MODULES } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  let connections: IntegrationConnectionRow[] = [];
  let mappings: IntegrationEventMappingRow[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const [c, m] = await Promise.all([
      query<IntegrationConnectionRow>(
        `select * from integration_connections order by provider, label`
      ),
      query<IntegrationEventMappingRow & { dest_label?: string }>(
        `select m.*, d.label as dest_label
         from integration_event_mappings m
         left join integration_connections d on d.id = m.dest_connection_id
         order by m.source_provider, m.source_event, d.label`
      ),
    ]);
    connections = c.rows;
    mappings = m.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar integrações";
  }

  const appUrl = getAppUrl().replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Conecte fontes e destinos. Várias contas por módulo. Mapeie eventos
          para um ou mais Meta/GA4.
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <IntegrationsHub
          modules={INTEGRATION_MODULES}
          appUrl={appUrl}
          connections={connections.map((c) => {
            const cfg =
              c.config && typeof c.config === "object" && !Array.isArray(c.config)
                ? (c.config as Record<string, string>)
                : {};
            return {
              id: c.id,
              provider: c.provider,
              label: c.label,
              active: c.active,
              auth_type: c.auth_type,
              direction: c.direction,
              account_external_id: c.account_external_id,
              hasToken: Boolean(c.access_token_cipher),
              hasWebhookSecret: Boolean(c.webhook_secret_cipher),
              config: cfg,
            };
          })}
          mappings={mappings.map((m) => ({
            id: m.id,
            source_provider: m.source_provider,
            source_connection_id: m.source_connection_id,
            source_event: m.source_event,
            dest_connection_id: m.dest_connection_id,
            dest_event_name: m.dest_event_name,
            enabled: m.enabled,
            dest_label: (m as { dest_label?: string }).dest_label,
          }))}
        />
      )}
    </div>
  );
}
