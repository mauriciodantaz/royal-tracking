"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";

import {
  deleteConnection,
  deleteEventMapping,
  reconfigureWhatsappWebhookAction,
  replayOrphanCrmEmitsAction,
  saveRdStageMapsAction,
  setPipelineEnabledAction,
  syncRdFunnelsAction,
  updateMetaTestEventCode,
  updateStackCurrency,
  upsertConnection,
  upsertEventMapping,
} from "@/app/dashboard/integracoes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IntegrationModuleDef } from "@/lib/integrations/registry";

const META_EVENT_OPTIONS = [
  "",
  "Lead",
  "CompleteRegistration",
  "Contact",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Subscribe",
];

const GA4_EVENT_OPTIONS = [
  "",
  "generate_lead",
  "sign_up",
  "begin_checkout",
  "add_payment_info",
  "purchase",
  "subscribe",
];

const META_SELECT_ITEMS = META_EVENT_OPTIONS.map((opt) =>
  opt ? { value: opt, label: opt } : { value: "__none__", label: "Não enviar" }
);

const GA4_SELECT_ITEMS = GA4_EVENT_OPTIONS.map((opt) =>
  opt ? { value: opt, label: opt } : { value: "__none__", label: "Não enviar" }
);

type OutboundOption = {
  id: string;
  label: string;
  provider: string;
};

function MappingForm({
  provider,
  defaultSourceEvent,
  outboundOptions,
  pending,
  start,
  onSaved,
}: {
  provider: string;
  defaultSourceEvent: string;
  outboundOptions: OutboundOption[];
  pending: boolean;
  start: ReturnType<typeof useTransition>[1];
  onSaved: () => void;
}) {
  const [destId, setDestId] = useState("");

  return (
    <form
      className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-4"
      action={(fd) =>
        start(async () => {
          if (!destId) {
            toast.error("Selecione um destino (pixel / GA4).");
            return;
          }
          fd.set("dest_connection_id", destId);
          try {
            await upsertEventMapping(fd);
            toast.success("Mapeamento salvo");
            setDestId("");
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        })
      }
    >
      <input type="hidden" name="source_provider" value={provider} />
      <input type="hidden" name="enabled" value="true" />
      <input type="hidden" name="dest_connection_id" value={destId} />
      <div className="space-y-1.5">
        <Label>Evento fonte</Label>
        <Input
          name="source_event"
          placeholder={defaultSourceEvent}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Destino</Label>
        <Select
          value={destId || undefined}
          onValueChange={(value) => setDestId(String(value ?? ""))}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent align="start" className="min-w-[var(--anchor-width)]">
            {outboundOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label} ({o.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Nome no destino</Label>
        <Input
          name="dest_event_name"
          placeholder="Purchase / generate_lead"
          required
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full">
          Adicionar mapeamento
        </Button>
      </div>
    </form>
  );
}

function DocsHelpLink({ provider }: { provider: string }) {
  return (
    <p className="text-sm">
      <Link
        href={`/dashboard/integracoes/${provider}/docs`}
        className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4 hover:opacity-80"
      >
        Precisa de ajuda com estes campos? Leia a documentação
        <ArrowRight className="size-3.5" />
      </Link>
    </p>
  );
}

type Conn = {
  id: string;
  label: string;
  active: boolean;
  account_external_id: string | null;
  /** Server-masked preview only — never plaintext. */
  accessTokenPreview: string;
  webhookSecretPreview: string;
  clientSecretPreview: string;
  config: Record<string, string>;
  webhookUrl: string | null;
  oauthConnected?: boolean;
  needsReauth?: boolean;
  webhookStatus?: string | null;
  webhookStatusMessage?: string | null;
};

function isWhatsappProvider(provider: string): boolean {
  return (
    provider === "evolution_api" ||
    provider === "uazapi" ||
    provider === "rdstation_conversas"
  );
}

function isRdConversasProvider(provider: string): boolean {
  return provider === "rdstation_conversas";
}

function WaMeLinkGenerator() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    "Olá! Tudo bem? Quero saber mais."
  );
  const [link, setLink] = useState("");
  const [campaignCopy, setCampaignCopy] = useState("");

  function ticketBody() {
    const ticketLine = `[rt:{{tracking}}]`;
    return `${message.trim()}\n\n${ticketLine}`;
  }

  function build() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Informe o telefone com DDI (ex.: 5511999999999).");
      return;
    }
    const body = ticketBody();
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
    setLink(url);
    setCampaignCopy(body);
  }

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      <div>
        <h2 className="text-sm font-medium">Gerador de link wa.me</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Escreva a mensagem como quiser (inclui *negrito* do WhatsApp). No
          final fica só <code className="font-mono">[rt:…]</code> — o snippet
          troca pelo código curto no clique.
        </p>
      </div>
      <div className="grid max-w-lg gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wa-phone">Telefone (DDI+DDD+número)</Label>
          <Input
            id="wa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999999999"
            className="font-mono text-xs"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-msg">Mensagem</Label>
          <textarea
            id="wa-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={"Olá! Quero saber mais."}
            rows={4}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        </div>
        <Button type="button" size="sm" className="w-fit" onClick={build}>
          Gerar link
        </Button>
      </div>
      {link ? (
        <div className="space-y-2">
          <p className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px]">
            {link}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Link copiado");
              } catch {
                toast.error("Não foi possível copiar");
              }
            }}
          >
            Copiar link
          </Button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
        <h3 className="text-sm font-medium">Campanha de mensagem / CTWA</h3>
        <p className="text-xs text-muted-foreground">
          Cole esta mensagem no criativo Meta (Click-to-WhatsApp). O placeholder{" "}
          <code className="font-mono">[rt:&#123;&#123;tracking&#125;&#125;]</code>{" "}
          só funciona em links do site com snippet; em CTWA nativo prefira o
          metadata <code className="font-mono">ctwa_clid</code> do webhook ou um{" "}
          <a href="/dashboard/links" className="underline underline-offset-2">
            link rastreado /r/…
          </a>
          .
        </p>
        {campaignCopy ? (
          <>
            <pre className="whitespace-pre-wrap rounded-md bg-background/80 px-3 py-2 font-mono text-[11px]">
              {campaignCopy}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(campaignCopy);
                  toast.success("Mensagem copiada");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
            >
              Copiar mensagem da campanha
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Gere o link acima para ver a mensagem pronta.
          </p>
        )}
      </div>

      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/90">
        Não remova a linha <code className="font-mono">[rt:…]</code> do final.
        Sem ela o WhatsApp não vira Lead rastreado. O resto da mensagem (incluindo
        negrito/MD no começo) pode editar à vontade.
      </p>
    </div>
  );
}

type StageMapItem = {
  id: string;
  stage_external_id: string | null;
  mkt_lifecycle: string | null;
  deal_status: string | null;
  meta_event_name: string;
  ga4_event_name: string;
  label: string;
  pipeline: string;
  pipeline_external_id: string | null;
  pipeline_enabled: boolean;
};

function secretPreviewForField(conn: Conn, key: string): string {
  if (key === "access_token") return conn.accessTokenPreview;
  if (key === "webhook_secret") return conn.webhookSecretPreview;
  if (key === "client_secret") return conn.clientSecretPreview;
  return "";
}

function fieldDefaultValue(conn: Conn, key: string): string {
  // Secrets are never prefilled — empty submit keeps the stored cipher.
  if (
    key === "access_token" ||
    key === "webhook_secret" ||
    key === "client_secret"
  ) {
    return "";
  }
  if (key === "label") return conn.label;
  if (key === "account_external_id") {
    return conn.config.account_external_id || conn.account_external_id || "";
  }
  return conn.config[key] || "";
}

function isFunnelCrmProvider(provider: string): boolean {
  return (
    provider === "rdstation_crm" ||
    provider === "rdstation_mkt" ||
    provider === "pipedrive"
  );
}

function groupStageMapsByPipeline(
  rows: StageMapItem[]
): Array<{
  pipeline: string;
  pipelineExternalId: string | null;
  enabled: boolean;
  stages: StageMapItem[];
}> {
  const order: string[] = [];
  const byPipe = new Map<string, StageMapItem[]>();
  for (const row of rows) {
    const key = row.pipeline_external_id
      ? `id:${row.pipeline_external_id}`
      : `name:${row.pipeline?.trim() || "Funil"}`;
    if (!byPipe.has(key)) {
      byPipe.set(key, []);
      order.push(key);
    }
    byPipe.get(key)!.push(row);
  }
  return order.map((key) => {
    const stages = byPipe.get(key)!;
    const first = stages[0]!;
    return {
      pipeline: first.pipeline?.trim() || "Funil",
      pipelineExternalId: first.pipeline_external_id,
      enabled: first.pipeline_enabled !== false,
      stages,
    };
  });
}

function MapEventRow({
  row,
  updateRow,
}: {
  row: StageMapItem;
  updateRow: (
    id: string,
    patch: Partial<Pick<StageMapItem, "meta_event_name" | "ga4_event_name">>
  ) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/40 p-3 sm:grid-cols-[minmax(0,1.2fr)_1fr_1fr]">
      <div className="min-w-0 self-center">
        <h3 className="truncate text-sm font-medium leading-snug">
          {row.label}
        </h3>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Meta</Label>
        <Select
          items={META_SELECT_ITEMS}
          value={row.meta_event_name || "__none__"}
          onValueChange={(value) => {
            const v = value === "__none__" ? "" : String(value ?? "");
            updateRow(row.id, { meta_event_name: v });
          }}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue placeholder="Não enviar" />
          </SelectTrigger>
          <SelectContent>
            {META_EVENT_OPTIONS.map((opt) => (
              <SelectItem key={opt || "none"} value={opt || "__none__"}>
                {opt || "Não enviar"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">GA4</Label>
        <Select
          items={GA4_SELECT_ITEMS}
          value={row.ga4_event_name || "__none__"}
          onValueChange={(value) => {
            const v = value === "__none__" ? "" : String(value ?? "");
            updateRow(row.id, { ga4_event_name: v });
          }}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue placeholder="Não enviar" />
          </SelectTrigger>
          <SelectContent>
            {GA4_EVENT_OPTIONS.map((opt) => (
              <SelectItem key={opt || "none"} value={opt || "__none__"}>
                {opt || "Não enviar"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function RdStageMapsSection({
  connectionId,
  maps,
  pending,
  start,
  onSaved,
}: {
  connectionId: string;
  maps: StageMapItem[];
  pending: boolean;
  start: ReturnType<typeof useTransition>[1];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(maps);
  const stageRows = rows.filter((r) => !r.deal_status);
  const statusRows = rows
    .filter((r) => r.deal_status)
    .slice()
    .sort((a, b) => {
      const order = { won: 0, lost: 1 } as Record<string, number>;
      return (order[a.deal_status || ""] ?? 9) - (order[b.deal_status || ""] ?? 9);
    });
  const groups = groupStageMapsByPipeline(stageRows);

  function updateRow(
    id: string,
    patch: Partial<Pick<StageMapItem, "meta_event_name" | "ga4_event_name">>
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function setGroupEnabled(pipelineExternalId: string, enabled: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.pipeline_external_id === pipelineExternalId
          ? { ...r, pipeline_enabled: enabled }
          : r
      )
    );
  }

  if (maps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum estágio sincronizado ainda. Conecte com OAuth ou clique em
        Sincronizar funis.
      </p>
    );
  }

  return (
    <div className="space-y-6 border-t border-border/50 pt-3">
      {stageRows.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Mapeamento estágio → Meta / GA4
            </h2>
            <p className="text-xs text-muted-foreground">
              Vazio = não enviar para aquele destino. Funil desligado esconde as
              etapas e bloqueia webhooks desse funil.
            </p>
          </div>

          <div className="space-y-6">
            {groups.map((group) => {
              const groupKey =
                group.pipelineExternalId || `name:${group.pipeline}`;
              const canToggle = Boolean(group.pipelineExternalId);
              return (
                <section key={groupKey} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {group.pipeline}
                    </h2>
                    {canToggle ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="size-4 accent-foreground"
                          checked={group.enabled}
                          disabled={pending}
                          onChange={(ev) => {
                            const enabled = ev.target.checked;
                            const pipeId = group.pipelineExternalId!;
                            setGroupEnabled(pipeId, enabled);
                            start(async () => {
                              const r = await setPipelineEnabledAction({
                                connectionId,
                                pipelineExternalId: pipeId,
                                enabled,
                              });
                              if (r.ok) {
                                toast.success(
                                  enabled
                                    ? `Funil "${group.pipeline}" ativado`
                                    : `Funil "${group.pipeline}" desativado`
                                );
                                onSaved();
                              } else {
                                setGroupEnabled(pipeId, !enabled);
                                toast.error(r.error);
                              }
                            });
                          }}
                        />
                        {group.enabled ? "Ativo" : "Desativado"}
                      </label>
                    ) : null}
                  </div>
                  {group.enabled ? (
                    <div className="space-y-2 pl-1 sm:pl-3">
                      {group.stages.map((row) => (
                        <MapEventRow
                          key={row.id}
                          row={row}
                          updateRow={updateRow}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {statusRows.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Status da negociação → Meta / GA4
            </h2>
            <p className="text-xs text-muted-foreground">
              Dispara quando a negociação muda para ganho (<code>won</code>) ou
              perda (<code>lost</code>). Dedup separado do estágio.
            </p>
          </div>
          <div className="space-y-2">
            {statusRows.map((row) => (
              <MapEventRow key={row.id} row={row} updateRow={updateRow} />
            ))}
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("connection_id", connectionId);
            fd.set(
              "maps",
              JSON.stringify(
                rows.map((r) => ({
                  id: r.id,
                  stage_external_id: r.stage_external_id,
                  mkt_lifecycle: r.mkt_lifecycle,
                  deal_status: r.deal_status,
                  meta_event_name: r.meta_event_name || null,
                  ga4_event_name: r.ga4_event_name || null,
                }))
              )
            );
            const r = await saveRdStageMapsAction(fd);
            if (r.ok) {
              toast.success("Mapeamentos salvos");
              onSaved();
            } else {
              toast.error(r.error);
            }
          })
        }
      >
        Salvar mapeamentos
      </Button>
    </div>
  );
}

type Mapping = {
  id: string;
  source_provider: string | null;
  source_event: string;
  dest_connection_id: string;
  dest_event_name: string;
  dest_label?: string;
};

export function ProviderDetailClient({
  module: mod,
  connections,
  mappings,
  outboundOptions,
  appUrl,
  allowedEventDomains = [],
  stackCurrency,
  stackTestEventCode,
  stageMapsByConnection = {},
  oauthCallbackUrl = null,
}: {
  module: IntegrationModuleDef;
  connections: Conn[];
  mappings: Mapping[];
  outboundOptions: OutboundOption[];
  appUrl: string;
  allowedEventDomains?: string[];
  stackCurrency: string;
  stackTestEventCode: string;
  stageMapsByConnection?: Record<string, StageMapItem[]>;
  oauthCallbackUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const rd = isFunnelCrmProvider(mod.provider);
  const pipedrive = mod.provider === "pipedrive";
  const whatsapp = isWhatsappProvider(mod.provider);
  const rdConversas = isRdConversasProvider(mod.provider);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/dashboard/integracoes" />}
        >
          <ArrowLeft className="size-3.5" />
          Voltar
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{mod.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {mod.description}
        </p>
        {(mod.provider === "meta_pixel" || mod.provider === "ga4") && (
          <p className="mt-2 inline-flex rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            Modo: web + server (deduplicação por event_id)
          </p>
        )}
        {rd && (
          <p className="mt-2 inline-flex rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            Fonte server-side → Meta CAPI + GA4 (destinos em modo web+server)
          </p>
        )}
        {whatsapp && (
          <p className="mt-2 inline-flex rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            {rdConversas
              ? "Cole a URL no Tallos (Integração com Webhook) · ative todas as opções · Lead só com [ticket=]"
              : "Webhook automático · Lead só com ticket na mensagem · ignore fromMe/grupos"}
          </p>
        )}
      </div>

      {oauthCallbackUrl ? (
        <section className="rounded-xl border border-border/60 p-4">
          <h2 className="text-sm font-medium">URL de callback OAuth</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {pipedrive
              ? "Cadastre esta URL no app Pipedrive (Developer Hub → OAuth Callback URL)."
              : "Cadastre esta URL no app da RD App Store (redirect URI)."}
          </p>
          <p className="mt-2 break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px]">
            {oauthCallbackUrl}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(oauthCallbackUrl);
                toast.success("Callback copiada");
              } catch {
                toast.error("Não foi possível copiar");
              }
            }}
          >
            Copiar URL
          </Button>
          {mod.docsSlug ? (
            <div className="mt-3">
              <DocsHelpLink provider={mod.provider} />
            </div>
          ) : null}
        </section>
      ) : null}

      {connections.length > 0 && mod.provider !== "snippet" ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">Contas nesta plataforma</h2>
            <p className="text-sm text-muted-foreground">
              Secrets ficam mascarados neste painel. Cole um valor novo só se
              for rotacionar; em branco mantém o atual. Validamos o acesso de
              novo antes de gravar.
            </p>
          </div>
          <ul className="space-y-4">
            {connections.map((c) => (
              <li
                key={c.id}
                className="space-y-3 rounded-xl border border-border/60 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {c.account_external_id || c.id.slice(0, 8)}
                      {c.active ? " · ativa" : " · inativa"}
                      {rd && c.oauthConnected ? " · OAuth OK" : null}
                      {rd && !c.oauthConnected ? " · aguardando OAuth" : null}
                    </p>
                    {c.needsReauth ? (
                      <p className="mt-1 text-xs text-destructive">
                        Refresh OAuth falhou — reconecte com OAuth.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        try {
                          await deleteConnection(c.id);
                          toast.success("Removida");
                          refresh();
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Erro"
                          );
                        }
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                {c.webhookUrl ? (
                  <div className="space-y-2">
                    <p className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      Webhook: {c.webhookUrl}
                    </p>
                    {rdConversas ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(c.webhookUrl!);
                              toast.success("URL do webhook copiada");
                            } catch {
                              toast.error("Não foi possível copiar");
                            }
                          }}
                        >
                          Copiar URL
                        </Button>
                        <p className="w-full text-xs text-muted-foreground">
                          Em{" "}
                          <a
                            href="https://app.tallos.com.br/app/integrations/webhooks"
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            Tallos → Integrações → Webhooks
                          </a>
                          : escolha Integração com Webhook, método POST, cole
                          esta URL e ative todas as opções. Só registramos Lead
                          quando a mensagem tiver{" "}
                          <code className="text-[10px]">[ticket=…]</code>.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {whatsapp && c.webhookStatus ? (
                  <p
                    className={
                      c.webhookStatus === "ok"
                        ? "text-xs text-muted-foreground"
                        : "text-xs text-amber-700 dark:text-amber-400"
                    }
                  >
                    Status do webhook: {c.webhookStatus}
                    {c.webhookStatusMessage
                      ? ` — ${c.webhookStatusMessage}`
                      : ""}
                  </p>
                ) : null}

                {whatsapp && !rdConversas ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await reconfigureWhatsappWebhookAction(
                            c.id
                          );
                          if (r.ok) {
                            toast.success("Webhook reconfigurado");
                            refresh();
                          } else {
                            toast.error(r.error);
                            refresh();
                          }
                        })
                      }
                    >
                      Reconfigurar webhook
                    </Button>
                  </div>
                ) : null}

                {whatsapp ? <WaMeLinkGenerator /> : null}

                {mod.connectFields.length > 0 &&
                (mod.authType !== "oauth" || rd) ? (
                  <form
                    className="grid max-w-lg gap-3 border-t border-border/50 pt-3"
                    action={(fd) =>
                      start(async () => {
                        try {
                          const r = await upsertConnection(fd);
                          if (r.ok) {
                            if (r.warning) {
                              toast.warning(r.warning);
                            } else {
                              toast.success(
                                rd
                                  ? "Credenciais salvas"
                                  : "Alterações validadas e salvas"
                              );
                            }
                            if (rd || whatsapp) {
                              refresh();
                            } else {
                              await new Promise((resolve) =>
                                setTimeout(resolve, 900)
                              );
                              router.push("/dashboard/integracoes");
                            }
                          } else {
                            toast.error(r.error);
                          }
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Erro"
                          );
                        }
                      })
                    }
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="provider" value={mod.provider} />
                    <input
                      type="hidden"
                      name="active"
                      value={c.active ? "true" : "false"}
                    />
                    {mod.connectFields.map((f) => {
                      const preview = f.secret
                        ? secretPreviewForField(c, f.key)
                        : "";
                      return (
                        <div key={`${c.id}-${f.key}`} className="space-y-1.5">
                          <Label htmlFor={`edit-${c.id}-${f.key}`}>
                            {f.label}
                          </Label>
                          {preview ? (
                            <p
                              className="break-all font-mono text-xs text-muted-foreground"
                              aria-label={`${f.label} mascarado`}
                            >
                              {preview}
                            </p>
                          ) : null}
                          <Input
                            id={`edit-${c.id}-${f.key}`}
                            name={f.key}
                            type="text"
                            required={
                              f.secret ? false : Boolean(f.required)
                            }
                            placeholder={
                              f.secret
                                ? preview
                                  ? "Deixe em branco para manter"
                                  : f.placeholder
                                : f.placeholder
                            }
                            defaultValue={fieldDefaultValue(c, f.key)}
                            autoComplete="off"
                            className={
                              f.secret ? "font-mono text-xs" : undefined
                            }
                          />
                        </div>
                      );
                    })}
                    <Button type="submit" disabled={pending} className="w-fit">
                      {pending ? "Salvando…" : "Salvar alterações"}
                    </Button>
                  </form>
                ) : null}

                {rd ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                    <Button
                      size="sm"
                      disabled={pending || !c.config.client_id}
                      render={
                        <a
                          href={`/api/integrations/${mod.provider}/oauth/start?connection_id=${c.id}`}
                        />
                      }
                    >
                      {c.oauthConnected
                        ? "Reconectar com OAuth"
                        : "Conectar com OAuth"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !c.oauthConnected}
                      onClick={() =>
                        start(async () => {
                          const r = await syncRdFunnelsAction(c.id);
                          if (r.ok) {
                            toast.success(
                              `Sincronizado: ${r.stages} estágios/slots`
                            );
                            refresh();
                          } else {
                            toast.error(r.error);
                          }
                        })
                      }
                    >
                      Sincronizar funis
                    </Button>
                    {mod.provider === "rdstation_crm" ||
                    mod.provider === "rdstation_mkt" ||
                    mod.provider === "pipedrive" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || !c.oauthConnected}
                        onClick={() =>
                          start(async () => {
                            const r = await replayOrphanCrmEmitsAction(c.id);
                            if (r.ok) {
                              toast.success(
                                `Reenvio: ${r.sent} enviados, ${r.skipped} pulados, ${r.failed} falhas (${r.attempted} neste lote)`
                              );
                              if (r.errors.length) {
                                toast.error(r.errors.slice(0, 3).join(" · "));
                              }
                              refresh();
                            } else {
                              toast.error(r.error);
                            }
                          })
                        }
                      >
                        Reenviar órfãos
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {rd ? (
                  <RdStageMapsSection
                    key={`${c.id}-${(stageMapsByConnection[c.id] ?? [])
                      .map((m) => m.id)
                      .join(",")}`}
                    connectionId={c.id}
                    maps={stageMapsByConnection[c.id] ?? []}
                    pending={pending}
                    start={start}
                    onSaved={refresh}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mod.provider === "snippet" ? (
        <section className="rounded-xl border border-border/60 p-5">
          <h2 className="text-base font-medium">Como usar</h2>
          {mod.docsSlug ? (
            <div className="mt-2">
              <DocsHelpLink provider={mod.provider} />
            </div>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            O snippet já está ativo. Cole no site do cliente:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
            {`<script src="${appUrl}/snippet.js" async></script>`}
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            PageView, forms (Lead) e eventos manuais entram automaticamente e
            seguem os mapeamentos configurados abaixo. O endpoint é a origem
            deste script (ou{" "}
            <code className="text-xs">window.TRCK_ENDPOINT</code>).
          </p>
          <div className="mt-4 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
            <p className="font-medium">Origens permitidas (eventos)</p>
            {allowedEventDomains.length > 0 ? (
              <p className="mt-1 text-muted-foreground">
                Apex configurado:{" "}
                <code className="text-xs">{allowedEventDomains.join(", ")}</code>
                . O site onde o snippet roda precisa ser esse domínio ou um
                subdomínio (ex.: www., lp.). Não use o host do painel como apex.
              </p>
            ) : (
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                <code className="text-xs">ALLOWED_EVENT_DOMAINS</code> não está
                definido — em produção a stack deve falhar no boot. Defina o
                apex do site no Portainer (ex.:{" "}
                <code className="text-xs">cliente.com.br</code>).
              </p>
            )}
          </div>

          <form
            className="mt-6 grid max-w-xs gap-3 border-t border-border/50 pt-4"
            action={(fd) =>
              start(async () => {
                try {
                  await updateStackCurrency(fd);
                  toast.success("Moeda salva");
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                }
              })
            }
          >
            <div className="space-y-1.5">
              <Label htmlFor="currency">Moeda padrão (compras)</Label>
              <Input
                id="currency"
                name="currency"
                defaultValue={stackCurrency}
                maxLength={3}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Usada quando Hotmart/Kiwify/etc. não enviam currency no webhook.
              </p>
            </div>
            <Button type="submit" disabled={pending} className="w-fit">
              Salvar moeda
            </Button>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-border/60 p-5">
          <h2 className="text-base font-medium">Adicionar integração</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha as credenciais para conectar outra conta desta plataforma.
          </p>
          {mod.docsSlug && !rd ? (
            <div className="mt-3">
              <DocsHelpLink provider={mod.provider} />
            </div>
          ) : null}

          {mod.authType === "oauth" && !rd ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Esta plataforma usa OAuth. Peça ao administrador para configurar
                as chaves do app e depois autorize a conta.
              </p>
              <Button
                render={
                  <a href={`/api/integrations/${mod.provider}/oauth/start`} />
                }
              >
                Conectar com OAuth
              </Button>
            </div>
          ) : null}

          {mod.connectFields.length > 0 &&
          (mod.authType !== "oauth" || rd) ? (
            <form
              className="mt-4 grid max-w-lg gap-3"
              action={(fd) =>
                start(async () => {
                  try {
                    const r = await upsertConnection(fd);
                    if (r.ok) {
                      if (r.warning) {
                        toast.warning(r.warning);
                      } else {
                        toast.success(
                          rd
                            ? "Credenciais salvas — clique em Conectar com OAuth na conta"
                            : rdConversas
                              ? "Salvo — copie a URL e cole no Tallos (POST, todas as opções)"
                              : whatsapp
                                ? "Instância salva e webhook configurado"
                                : "Conexão validada e integração salva"
                        );
                      }
                      if (rd || whatsapp) {
                        refresh();
                      } else {
                        await new Promise((resolve) =>
                          setTimeout(resolve, 900)
                        );
                        router.push("/dashboard/integracoes");
                      }
                    } else {
                      toast.error(r.error);
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Erro");
                  }
                })
              }
            >
              <input type="hidden" name="provider" value={mod.provider} />
              <input type="hidden" name="active" value="true" />
              {mod.connectFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`field-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`field-${f.key}`}
                    name={f.key}
                    type="text"
                    required={Boolean(f.required)}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    className={f.secret ? "font-mono text-xs" : undefined}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {rd
                  ? "Salve Client ID/Secret e depois autorize com OAuth na conta criada."
                  : rdConversas
                    ? "Ao salvar, geramos a URL pronta. Cole no Tallos em Integração com Webhook (POST) e ative todas as opções — só escutamos; Lead só com [ticket=]."
                    : whatsapp
                      ? "Use a key da instância (não a global). Ao salvar, validamos o acesso e registramos o webhook automaticamente."
                      : "Ao salvar, validamos o acesso na plataforma; se falhar, nada é gravado. Depois de salvos, secrets aparecem só mascarados."}
              </p>
              <Button type="submit" disabled={pending} className="w-fit">
                {pending
                  ? "Salvando…"
                  : rd
                    ? "Salvar credenciais"
                    : "Adicionar integração"}
              </Button>
            </form>
          ) : null}
        </section>
      )}

      {mod.provider === "meta_pixel" ? (
        <section className="rounded-xl border border-border/60 p-5">
          <h2 className="text-base font-medium">Teste Meta (Events Manager)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Código padrão deste ambiente. Cada pixel pode ter o próprio no
            formulário de conexão; se vazio, usa este.
          </p>
          <form
            className="mt-4 grid max-w-md gap-3"
            action={(fd) =>
              start(async () => {
                try {
                  await updateMetaTestEventCode(fd);
                  toast.success("Test event code salvo");
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                }
              })
            }
          >
            <div className="space-y-1.5">
              <Label htmlFor="test_event_code">test_event_code</Label>
              <Input
                id="test_event_code"
                name="test_event_code"
                defaultValue={stackTestEventCode}
                className="font-mono"
                placeholder="TEST12345"
              />
            </div>
            <Button type="submit" disabled={pending} className="w-fit">
              Salvar
            </Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Mapeamento de eventos</h2>
          <p className="text-sm text-muted-foreground">
            Quando esta fonte dispara um evento, para quais destinos enviar.
          </p>
        </div>

        {mappings.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {mappings.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm">
                  <span className="font-medium">{m.source_event}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span>{m.dest_label ?? m.dest_connection_id.slice(0, 8)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {" "}
                    ({m.dest_event_name})
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        await deleteEventMapping(m.id);
                        toast.success("Mapeamento removido");
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    })
                  }
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum mapeamento específico. O dispatcher usa os defaults (Meta/GA4
            ativos) quando existirem.
          </p>
        )}

        {outboundOptions.length > 0 ? (
          <MappingForm
            provider={mod.provider}
            defaultSourceEvent={mod.defaultSourceEvents?.[0] ?? "Lead"}
            outboundOptions={outboundOptions}
            pending={pending}
            start={start}
            onSaved={refresh}
          />
        ) : null}
      </section>
    </div>
  );
}
