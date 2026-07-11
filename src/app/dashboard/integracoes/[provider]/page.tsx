import { notFound } from "next/navigation";

import { ProviderDetailClient } from "@/app/dashboard/integracoes/[provider]/provider-detail-client";
import { Card, CardContent } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type {
  IntegrationConnectionRow,
  IntegrationEventMappingRow,
} from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import {
  getModule,
  isIntegrationProvider,
} from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ provider: string }> };

export default async function ProviderIntegracaoPage({ params }: Props) {
  const { provider } = await params;
  if (!isIntegrationProvider(provider)) notFound();

  const mod = getModule(provider);
  if (!mod) notFound();

  let connections: IntegrationConnectionRow[] = [];
  let mappings: Array<IntegrationEventMappingRow & { dest_label?: string }> =
    [];
  let outbound: IntegrationConnectionRow[] = [];
  let error: string | null = null;
  const appUrl = getAppUrl().replace(/\/$/, "");

  try {
    await ensureDbReady();
    const [c, m, o] = await Promise.all([
      query<IntegrationConnectionRow>(
        `select * from integration_connections
         where provider = $1
         order by created_at desc`,
        [provider]
      ),
      query<IntegrationEventMappingRow & { dest_label?: string }>(
        `select m.*, d.label as dest_label
         from integration_event_mappings m
         left join integration_connections d on d.id = m.dest_connection_id
         where m.source_provider = $1
         order by m.source_event, d.label`,
        [provider]
      ),
      query<IntegrationConnectionRow>(
        `select * from integration_connections
         where active = true
           and provider in ('meta_pixel', 'ga4', 'google_ads')
         order by provider, label`
      ),
    ]);
    connections = c.rows;
    mappings = m.rows;
    outbound = o.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar";
  }

  if (error) {
    return (
      <Card className="glass border-destructive/40">
        <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  return (
    <ProviderDetailClient
      module={mod}
      appUrl={appUrl}
      connections={connections.map((c) => ({
        id: c.id,
        label: c.label,
        active: c.active,
        account_external_id: c.account_external_id,
        hasToken: Boolean(c.access_token_cipher),
        hasWebhookSecret: Boolean(c.webhook_secret_cipher),
        webhookUrl:
          (c.direction === "inbound" || c.direction === "both") &&
          (mod.authType === "webhook_secret" || c.webhook_secret_cipher)
            ? `${appUrl}/api/webhook/in/${c.id}`
            : null,
      }))}
      mappings={mappings.map((m) => ({
        id: m.id,
        source_provider: m.source_provider,
        source_event: m.source_event,
        dest_connection_id: m.dest_connection_id,
        dest_event_name: m.dest_event_name,
        dest_label: m.dest_label,
      }))}
      outboundOptions={outbound.map((c) => ({
        id: c.id,
        label: c.label,
        provider: c.provider,
      }))}
    />
  );
}
