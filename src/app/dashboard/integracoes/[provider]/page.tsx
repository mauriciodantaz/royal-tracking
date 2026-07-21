import { notFound } from "next/navigation";

import { ProviderDetailClient } from "@/app/dashboard/integracoes/[provider]/provider-detail-client";
import { Card, CardContent } from "@/components/ui/card";
import { decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type {
  IntegrationConnectionRow,
  IntegrationEventMappingRow,
} from "@/lib/db/types";
import { getAppUrl } from "@/lib/env";
import {
  getModule,
  isUiVisibleProvider,
} from "@/lib/integrations/registry";
import { ensureShortWebhookUrl } from "@/lib/integrations/webhook-slug";
import { metadataRecord } from "@/lib/rd/credentials";
import { MKT_LIFECYCLE_SLOTS } from "@/lib/rd/mkt";
import { getAllowedEventDomains } from "@/lib/tracking/allowed-origins";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ provider: string }> };

async function safeDecrypt(cipher: string | null): Promise<string> {
  if (!cipher) return "";
  try {
    return await decryptSecret(cipher);
  } catch {
    return "";
  }
}

function configRecord(
  config: IntegrationConnectionRow["config"]
): Record<string, string> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (v != null && v !== "" && k !== "client_secret_cipher") {
      out[k] = String(v);
    }
  }
  return out;
}

type StageMapRow = {
  id: string;
  connection_id: string;
  stage_external_id: string | null;
  mkt_lifecycle: string | null;
  deal_status: string | null;
  meta_event_name: string | null;
  ga4_event_name: string | null;
  stage_name: string | null;
  pipeline_name: string | null;
  stage_order: number | null;
};

const DEAL_STATUS_LABELS: Record<string, string> = {
  won: "Ganho (won)",
  lost: "Perda (lost)",
};

export default async function ProviderIntegracaoPage({ params }: Props) {
  const { provider } = await params;
  if (!isUiVisibleProvider(provider)) notFound();

  const mod = getModule(provider);
  if (!mod) notFound();

  let connections: IntegrationConnectionRow[] = [];
  let mappings: Array<IntegrationEventMappingRow & { dest_label?: string }> =
    [];
  let outbound: IntegrationConnectionRow[] = [];
  let stageMaps: StageMapRow[] = [];
  let stackCurrency = "BRL";
  let stackTestEventCode = "";
  let error: string | null = null;
  const appUrl = getAppUrl().replace(/\/$/, "");

  const isRd =
    provider === "rdstation_crm" || provider === "rdstation_mkt";
  const isPipedrive = provider === "pipedrive";
  const isFunnelCrm = isRd || isPipedrive;

  try {
    await ensureDbReady();
    const [c, m, o, s] = await Promise.all([
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
      queryOne<{ currency: string; test_event_code: string | null }>(
        `select currency, test_event_code from settings where id = 1 limit 1`
      ),
    ]);
    connections = c.rows;
    mappings = m.rows;
    outbound = o.rows;
    if (s) {
      stackCurrency = s.currency || "BRL";
      stackTestEventCode = s.test_event_code ?? "";
    }

    // Ensure short /api/w/{slug} URLs for inbound connections shown in UI.
    if (connections.length > 0) {
      const needsShort = [
        "rdstation_conversas",
        "evolution_api",
        "uazapi",
        "rdstation_crm",
        "rdstation_mkt",
        "pipedrive",
        "hotmart",
        "kiwify",
        "eduzz",
      ].includes(provider);
      if (needsShort) {
        // Only mint short URLs on page load. Do NOT re-register webhooks here —
        // UazAPI advanced "add" would create duplicates on every refresh.
        // Registration runs on save / "Reconfigurar webhook".
        await Promise.all(
          connections.map(async (row) => {
            try {
              await ensureShortWebhookUrl(row.id);
            } catch {
              /* keep page renderable */
            }
          })
        );
        const refreshed = await query<IntegrationConnectionRow>(
          `select * from integration_connections
           where provider = $1
           order by created_at desc`,
          [provider]
        );
        connections = refreshed.rows;
      }
    }

    if (isFunnelCrm && connections.length > 0) {
      const ids = connections.map((x) => x.id);
      if (isPipedrive) {
        const maps = await query<StageMapRow>(
          `select
             m.id,
             m.connection_id,
             m.stage_external_id,
             null::text as mkt_lifecycle,
             m.deal_status,
             m.meta_event_name,
             m.ga4_event_name,
             s.name as stage_name,
             p.name as pipeline_name,
             s.stage_order
           from pipedrive_stage_event_maps m
           left join pipedrive_stages s
             on s.connection_id = m.connection_id
            and s.external_id = m.stage_external_id
           left join pipedrive_pipelines p on p.id = s.pipeline_id
           where m.connection_id = any($1::uuid[])
           order by m.connection_id,
             case when m.deal_status is not null then 1 else 0 end,
             p.name nulls last,
             s.stage_order nulls last,
             m.deal_status`,
          [ids]
        );
        stageMaps = maps.rows.map((row) =>
          row.deal_status
            ? {
                ...row,
                stage_name:
                  DEAL_STATUS_LABELS[row.deal_status] || row.deal_status,
                pipeline_name: "Status da negociação",
              }
            : row
        );
      } else {
        const maps = await query<StageMapRow>(
          `select
             m.id,
             m.connection_id,
             m.stage_external_id,
             m.mkt_lifecycle,
             m.deal_status,
             m.meta_event_name,
             m.ga4_event_name,
             s.name as stage_name,
             p.name as pipeline_name,
             s.stage_order
           from rd_stage_event_maps m
           left join rd_stages s
             on s.connection_id = m.connection_id
            and s.external_id = m.stage_external_id
           left join rd_pipelines p on p.id = s.pipeline_id
           where m.connection_id = any($1::uuid[])
           order by m.connection_id,
             case when m.deal_status is not null then 1 else 0 end,
             p.name nulls last,
             s.stage_order nulls last,
             m.mkt_lifecycle,
             m.deal_status`,
          [ids]
        );
        stageMaps = maps.rows;

        if (provider === "rdstation_mkt") {
          const labels = Object.fromEntries(
            MKT_LIFECYCLE_SLOTS.map((x) => [x.key, x.label])
          );
          stageMaps = stageMaps.map((row) => ({
            ...row,
            stage_name: row.mkt_lifecycle
              ? labels[row.mkt_lifecycle] || row.mkt_lifecycle
              : row.stage_name,
            pipeline_name: row.mkt_lifecycle
              ? "Lifecycle MKT"
              : row.pipeline_name,
          }));
        }

        if (provider === "rdstation_crm") {
          stageMaps = stageMaps.map((row) =>
            row.deal_status
              ? {
                  ...row,
                  stage_name:
                    DEAL_STATUS_LABELS[row.deal_status] || row.deal_status,
                  pipeline_name: "Status da negociação",
                }
              : row
          );
        }
      }
    }
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

  const connectionsForClient = await Promise.all(
    connections.map(async (c) => {
      const cfg = configRecord(c.config);
      const accessToken = await safeDecrypt(c.access_token_cipher);
      const webhookSecret = await safeDecrypt(c.webhook_secret_cipher);
      const secretCipher =
        c.config &&
        typeof c.config === "object" &&
        !Array.isArray(c.config) &&
        typeof (c.config as Record<string, unknown>).client_secret_cipher ===
          "string"
          ? String(
              (c.config as Record<string, unknown>).client_secret_cipher
            )
          : null;
      if (secretCipher) {
        cfg.client_secret = await safeDecrypt(secretCipher);
      }
      const meta = metadataRecord(c.metadata);
      const whMeta =
        meta.whatsapp_webhook &&
        typeof meta.whatsapp_webhook === "object" &&
        !Array.isArray(meta.whatsapp_webhook)
          ? (meta.whatsapp_webhook as Record<string, unknown>)
          : null;
      const isWhatsapp =
        provider === "evolution_api" ||
        provider === "uazapi" ||
        provider === "rdstation_conversas";
      const inboundBase = `${appUrl}/api/webhook/in/${c.id}`;
      const metaWebhookUrl =
        typeof whMeta?.url === "string" && whMeta.url ? whMeta.url : null;
      const shortSlug =
        typeof cfg.webhook_slug === "string" &&
        /^[A-Za-z0-9_-]{8,32}$/.test(cfg.webhook_slug)
          ? cfg.webhook_slug
          : "";
      let webhookUrl: string | null = null;
      if (
        (c.direction === "inbound" || c.direction === "both") &&
        (mod.authType === "webhook_secret" ||
          c.webhook_secret_cipher ||
          isFunnelCrm ||
          isWhatsapp)
      ) {
        if (shortSlug) {
          webhookUrl = `${appUrl}/api/w/${shortSlug}`;
        } else if (metaWebhookUrl) {
          webhookUrl = metaWebhookUrl;
        } else {
          webhookUrl = inboundBase;
        }
      }
      return {
        id: c.id,
        label: c.label,
        active: c.active,
        account_external_id: c.account_external_id,
        accessToken,
        webhookSecret,
        config: cfg,
        oauthConnected: Boolean(c.access_token_cipher),
        needsReauth: meta.needs_reauth === true,
        webhookUrl,
        webhookStatus:
          typeof whMeta?.status === "string" ? whMeta.status : null,
        webhookStatusMessage:
          typeof whMeta?.message === "string" ? whMeta.message : null,
      };
    })
  );

  const stageMapsByConnection = Object.fromEntries(
    connectionsForClient.map((c) => [
      c.id,
      stageMaps
        .filter((m) => m.connection_id === c.id)
        .map((m) => ({
          id: m.id,
          stage_external_id: m.stage_external_id,
          mkt_lifecycle: m.mkt_lifecycle,
          deal_status: m.deal_status,
          meta_event_name: m.meta_event_name ?? "",
          ga4_event_name: m.ga4_event_name ?? "",
          label:
            m.stage_name ||
            m.mkt_lifecycle ||
            m.deal_status ||
            m.stage_external_id ||
            "Estágio",
          pipeline: m.pipeline_name || "",
        })),
    ])
  );

  return (
    <ProviderDetailClient
      module={mod}
      appUrl={appUrl}
      allowedEventDomains={getAllowedEventDomains()}
      connections={connectionsForClient}
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
      stackCurrency={stackCurrency}
      stackTestEventCode={stackTestEventCode}
      stageMapsByConnection={stageMapsByConnection}
      oauthCallbackUrl={
        isFunnelCrm
          ? `${appUrl}/api/integrations/${provider}/oauth/callback`
          : null
      }
    />
  );
}
