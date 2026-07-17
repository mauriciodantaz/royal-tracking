"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";

import {
  deleteConnection,
  deleteEventMapping,
  saveRdStageMapsAction,
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
  accessToken: string;
  webhookSecret: string;
  config: Record<string, string>;
  webhookUrl: string | null;
  oauthConnected?: boolean;
  needsReauth?: boolean;
};

type StageMapItem = {
  id: string;
  stage_external_id: string | null;
  mkt_lifecycle: string | null;
  meta_event_name: string;
  ga4_event_name: string;
  label: string;
  pipeline: string;
};

function fieldDefaultValue(
  conn: Conn,
  key: string
): string {
  if (key === "label") return conn.label;
  if (key === "access_token") return conn.accessToken;
  if (key === "webhook_secret") return conn.webhookSecret;
  if (key === "client_secret") return conn.config.client_secret || "";
  if (key === "account_external_id") {
    return conn.config.account_external_id || conn.account_external_id || "";
  }
  return conn.config[key] || "";
}

function isRdProvider(provider: string): boolean {
  return provider === "rdstation_crm" || provider === "rdstation_mkt";
}

function groupStageMapsByPipeline(
  rows: StageMapItem[]
): Array<{ pipeline: string; stages: StageMapItem[] }> {
  const order: string[] = [];
  const byPipe = new Map<string, StageMapItem[]>();
  for (const row of rows) {
    const key = row.pipeline?.trim() || "Funil";
    if (!byPipe.has(key)) {
      byPipe.set(key, []);
      order.push(key);
    }
    byPipe.get(key)!.push(row);
  }
  return order.map((pipeline) => ({
    pipeline,
    stages: byPipe.get(pipeline)!,
  }));
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
  const groups = groupStageMapsByPipeline(rows);

  function updateRow(
    id: string,
    patch: Partial<Pick<StageMapItem, "meta_event_name" | "ga4_event_name">>
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
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
    <div className="space-y-4 border-t border-border/50 pt-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          Mapeamento estágio → Meta / GA4
        </h2>
        <p className="text-xs text-muted-foreground">
          Vazio = não enviar para aquele destino. Dedup por estágio da
          negociação.
        </p>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.pipeline} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              {group.pipeline}
            </h2>
            <div className="space-y-2 pl-1 sm:pl-3">
              {group.stages.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-lg border border-border/40 p-3 sm:grid-cols-[minmax(0,1.2fr)_1fr_1fr]"
                >
                  <div className="min-w-0 self-center">
                    <h3 className="truncate text-sm font-medium leading-snug">
                      {row.label}
                    </h3>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Meta</Label>
                    <Select
                      value={row.meta_event_name || "__none__"}
                      onValueChange={(value) => {
                        const v =
                          value === "__none__" ? "" : String(value ?? "");
                        updateRow(row.id, { meta_event_name: v });
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Não enviar" />
                      </SelectTrigger>
                      <SelectContent>
                        {META_EVENT_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt || "none"}
                            value={opt || "__none__"}
                          >
                            {opt || "Não enviar"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">GA4</Label>
                    <Select
                      value={row.ga4_event_name || "__none__"}
                      onValueChange={(value) => {
                        const v =
                          value === "__none__" ? "" : String(value ?? "");
                        updateRow(row.id, { ga4_event_name: v });
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Não enviar" />
                      </SelectTrigger>
                      <SelectContent>
                        {GA4_EVENT_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt || "none"}
                            value={opt || "__none__"}
                          >
                            {opt || "Não enviar"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

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
  stackCurrency: string;
  stackTestEventCode: string;
  stageMapsByConnection?: Record<string, StageMapItem[]>;
  oauthCallbackUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const rd = isRdProvider(mod.provider);

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
      </div>

      {oauthCallbackUrl ? (
        <section className="rounded-xl border border-border/60 p-4">
          <h2 className="text-sm font-medium">URL de callback OAuth</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre esta URL no app da RD App Store (redirect URI).
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
              Credenciais visíveis neste painel (self-hosted). Edite e salve —
              validamos o acesso de novo antes de gravar.
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
                  <p className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    Webhook: {c.webhookUrl}
                  </p>
                ) : null}

                {mod.connectFields.length > 0 &&
                (mod.authType !== "oauth" || rd) ? (
                  <form
                    className="grid max-w-lg gap-3 border-t border-border/50 pt-3"
                    action={(fd) =>
                      start(async () => {
                        try {
                          const r = await upsertConnection(fd);
                          if (r.ok) {
                            toast.success(
                              rd
                                ? "Credenciais salvas"
                                : "Alterações validadas e salvas"
                            );
                            if (!rd) {
                              await new Promise((resolve) =>
                                setTimeout(resolve, 900)
                              );
                              router.push("/dashboard/integracoes");
                            } else {
                              refresh();
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
                    {mod.connectFields.map((f) => (
                      <div key={`${c.id}-${f.key}`} className="space-y-1.5">
                        <Label htmlFor={`edit-${c.id}-${f.key}`}>{f.label}</Label>
                        <Input
                          id={`edit-${c.id}-${f.key}`}
                          name={f.key}
                          type="text"
                          required={
                            f.key === "client_secret"
                              ? false
                              : Boolean(f.required)
                          }
                          placeholder={
                            f.key === "client_secret"
                              ? "Deixe em branco para manter"
                              : f.placeholder
                          }
                          defaultValue={fieldDefaultValue(c, f.key)}
                          autoComplete="off"
                          className={f.secret ? "font-mono text-xs" : undefined}
                        />
                      </div>
                    ))}
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
            O snippet já está ativo nesta stack. Cole no site do cliente:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
            {`<script src="${appUrl}/snippet.js" async></script>`}
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            PageView, forms (Lead) e eventos manuais entram automaticamente e
            seguem os mapeamentos configurados abaixo.
          </p>

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
                Esta plataforma usa OAuth. Configure CLIENT_ID/SECRET no
                Portainer e autorize a conta.
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
                      toast.success(
                        rd
                          ? "Credenciais salvas — clique em Conectar com OAuth na conta"
                          : "Conexão validada e integração salva"
                      );
                      if (rd) {
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
                  : "Tokens ficam visíveis neste painel. Ao salvar, validamos o acesso na plataforma; se falhar, nada é gravado."}
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
            Código padrão da stack. Cada pixel pode ter o próprio no formulário
            de conexão; se vazio, usa este.
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
