"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SnippetSettings } from "@/lib/tracking/snippet-config";
import type { TrackingRule } from "@/lib/tracking/tracking-rules";

import {
  addSimplePathRule,
  deleteSnippetRule,
  previewRuleUrl,
  saveSnippetDiscoverySettings,
} from "./actions";

const COMMON_EVENTS = [
  "begin_checkout",
  "view_cart",
  "purchase",
  "view_item",
  "search",
] as const;

const OTHER_EVENT = "__other__";

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

function pathHint(rule: TrackingRule): string | null {
  const cond = rule.conditions.find(
    (c) => c.field === "path" && c.op === "contains" && c.value
  );
  return cond?.value ?? null;
}

function formatPathRule(
  rule: TrackingRule,
  kind: "force" | "exclude_pageview" | "exclude_lead" | "map"
): ReactNode {
  const path = pathHint(rule);
  const event = rule.event_name ?? "?";

  switch (kind) {
    case "force":
      return path ? (
        <>
          Se a URL contém <Mono>{path}</Mono> → dispara <Mono>{event}</Mono>
        </>
      ) : (
        <>
          Dispara <Mono>{event}</Mono> ({rule.id})
        </>
      );
    case "exclude_pageview":
      return path ? (
        <>
          Se a URL contém <Mono>{path}</Mono> → não registra PageView
        </>
      ) : (
        <>Exclui PageView ({rule.id})</>
      );
    case "exclude_lead":
      return path ? (
        <>
          Se a URL contém <Mono>{path}</Mono> → não registra Lead
        </>
      ) : (
        <>Exclui Lead ({rule.id})</>
      );
    case "map":
      return path ? (
        <>
          Se a URL contém <Mono>{path}</Mono> → renomeia evento para{" "}
          <Mono>{event}</Mono>
        </>
      ) : (
        <>
          Renomeia evento para <Mono>{event}</Mono> ({rule.id})
        </>
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function RuleRow({
  rule,
  label,
  pending,
  onRemove,
}: {
  rule: TrackingRule;
  label: ReactNode;
  pending: boolean;
  onRemove: (fd: FormData) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0 last:pb-0">
      <p>{label}</p>
      <form action={onRemove}>
        <input type="hidden" name="id" value={rule.id} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Remover
        </Button>
      </form>
    </div>
  );
}

export function RegrasClient({ settings }: { settings: SnippetSettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [eventChoice, setEventChoice] = useState<string>("begin_checkout");

  const forceRules = settings.rules.filter((r) => r.action === "force_event");
  const excludePageview = settings.rules.filter(
    (r) => r.action === "exclude_pageview"
  );
  const excludeLead = settings.rules.filter((r) => r.action === "exclude_lead");
  const mapRules = settings.rules.filter((r) => r.action === "map_event_name");

  const rulesJson = JSON.stringify(settings.rules);
  const preserveParamsValue = settings.url_preserve_params.join("\n");

  function runAdd(fd: FormData, okMsg: string) {
    start(async () => {
      const res = await addSimplePathRule(fd);
      setMsg(res.ok ? okMsg : res.error);
    });
  }

  function runDelete(fd: FormData) {
    start(async () => {
      const res = await deleteSnippetRule(fd);
      setMsg(res.ok ? "Regra removida." : res.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">
            O que o snippet deve fazer sozinho
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            action={(fd) => {
              start(async () => {
                const res = await saveSnippetDiscoverySettings(fd);
                setMsg(res.ok ? "Salvo." : res.error);
              });
            }}
          >
            <input type="hidden" name="rules_json" value={rulesJson} />
            <input
              type="hidden"
              name="url_preserve_params"
              value={preserveParamsValue}
            />

            <div className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="auto_ecommerce"
                  defaultChecked={settings.auto_ecommerce}
                  className="mt-0.5"
                />
                <span className="font-medium">
                  Detectar funil de loja automaticamente
                </span>
              </label>
              <p className="pl-6 text-xs text-muted-foreground">
                Ligue em lojas com URLs típicas (produto, carrinho, checkout).
                Deixe off se o funil for custom ou se você criar as regras
                manuais abaixo.
              </p>
            </div>

            <div className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="listen_datalayer"
                  defaultChecked={settings.listen_datalayer}
                  className="mt-0.5"
                />
                <span className="font-medium">
                  Aproveitar eventos do Google Tag Manager / dataLayer
                </span>
              </label>
              <p className="pl-6 text-xs text-muted-foreground">
                Ligue se o site já envia eventos pelo dataLayer. Deixe off se
                não usa Tag Manager nem dataLayer.
              </p>
            </div>

            <Button type="submit" size="sm" disabled={pending}>
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">
            Quando a URL tiver…, dispara…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-3"
            action={(fd) => {
              const choice = String(fd.get("event_choice") ?? "");
              const custom = String(fd.get("event_name_custom") ?? "").trim();
              const eventName =
                choice === OTHER_EVENT ? custom : choice || custom;
              fd.set("action", "force_event");
              fd.set("event_name", eventName);
              fd.delete("event_choice");
              fd.delete("event_name_custom");
              runAdd(fd, "Regra criada.");
            }}
          >
            <div>
              <label className="text-xs text-muted-foreground">
                URL contém
              </label>
              <Input
                name="path_contains"
                placeholder="/checkout"
                required
                className="min-w-[160px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Disparar evento
              </label>
              <select
                name="event_choice"
                className="flex h-9 w-full min-w-[180px] rounded-md border bg-background px-2 text-sm"
                value={eventChoice}
                onChange={(e) => setEventChoice(e.target.value)}
              >
                {COMMON_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
                <option value={OTHER_EVENT}>Outro…</option>
              </select>
            </div>
            {eventChoice === OTHER_EVENT ? (
              <div>
                <label className="text-xs text-muted-foreground">
                  Nome do evento
                </label>
                <Input
                  name="event_name_custom"
                  placeholder="meu_evento"
                  required
                  className="min-w-[160px]"
                />
              </div>
            ) : null}
            <Button type="submit" size="sm" disabled={pending}>
              Criar regra
            </Button>
          </form>

          {forceRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra de evento por URL. PageView e Lead já funcionam sem
              configuração.
            </p>
          ) : (
            <div className="space-y-2">
              {forceRules.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  label={formatPathRule(r, "force")}
                  pending={pending}
                  onRemove={runDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <details className="glass rounded-xl border border-border/60">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium">
          Avançado
        </summary>
        <div className="space-y-8 border-t border-border/40 px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Excluir PageView</h3>
            <p className="text-xs text-muted-foreground">
              Páginas admin, logout e preview já são ignoradas automaticamente.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              action={(fd) => {
                fd.set("action", "exclude_pageview");
                runAdd(fd, "Exclusão de PageView criada.");
              }}
            >
              <div>
                <label className="text-xs text-muted-foreground">
                  URL contém
                </label>
                <Input name="path_contains" placeholder="/minha-conta" required />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Excluir PageView
              </Button>
            </form>
            {excludePageview.length > 0 ? (
              <div className="space-y-2">
                {excludePageview.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    label={formatPathRule(r, "exclude_pageview")}
                    pending={pending}
                    onRemove={runDelete}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Excluir Lead</h3>
            <form
              className="flex flex-wrap items-end gap-2"
              action={(fd) => {
                fd.set("action", "exclude_lead");
                runAdd(fd, "Exclusão de Lead criada.");
              }}
            >
              <div>
                <label className="text-xs text-muted-foreground">
                  URL contém
                </label>
                <Input name="path_contains" placeholder="/newsletter" required />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Excluir Lead
              </Button>
            </form>
            {excludeLead.length > 0 ? (
              <div className="space-y-2">
                {excludeLead.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    label={formatPathRule(r, "exclude_lead")}
                    pending={pending}
                    onRemove={runDelete}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">
              Params a preservar na URL canônica
            </h3>
            <p className="text-xs text-muted-foreground">
              Por padrão UTMs e click IDs são removidos. Liste aqui params que
              devem permanecer (um por linha).
            </p>
            <form
              className="space-y-3"
              action={(fd) => {
                start(async () => {
                  const res = await saveSnippetDiscoverySettings(fd);
                  setMsg(res.ok ? "Params salvos." : res.error);
                });
              }}
            >
              <input type="hidden" name="rules_json" value={rulesJson} />
              {settings.auto_ecommerce ? (
                <input type="hidden" name="auto_ecommerce" value="on" />
              ) : null}
              {settings.listen_datalayer ? (
                <input type="hidden" name="listen_datalayer" value="on" />
              ) : null}
              <textarea
                name="url_preserve_params"
                defaultValue={preserveParamsValue}
                className="min-h-[72px] w-full max-w-lg rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={"categoria\npage"}
              />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Salvar params
              </Button>
            </form>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Testar esta URL</h3>
            <form
              className="flex flex-wrap items-end gap-2"
              action={(fd) => {
                start(async () => {
                  const res = await previewRuleUrl(fd);
                  if (!res.ok) {
                    setPreview(res.error);
                    return;
                  }
                  setPreview(JSON.stringify(res.preview, null, 2));
                });
              }}
            >
              <Input
                name="url"
                className="min-w-[280px] max-w-xl"
                placeholder="https://loja.com/checkout"
                required
              />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Testar
              </Button>
            </form>
            {preview ? (
              <pre className="overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                {preview}
              </pre>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Mapear nome de evento</h3>
            <p className="text-xs text-muted-foreground">
              Renomeia o evento forçado quando a URL bater com o trecho.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              action={(fd) => {
                fd.set("action", "map_event_name");
                runAdd(fd, "Mapeamento criado.");
              }}
            >
              <div>
                <label className="text-xs text-muted-foreground">
                  URL contém
                </label>
                <Input name="path_contains" placeholder="/obrigado" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Novo nome
                </label>
                <Input name="event_name" placeholder="purchase" required />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Criar mapeamento
              </Button>
            </form>
            {mapRules.length > 0 ? (
              <div className="space-y-2">
                {mapRules.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    label={formatPathRule(r, "map")}
                    pending={pending}
                    onRemove={runDelete}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </details>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Sugestões automáticas também aparecem em{" "}
          <Link
            href="/dashboard/formularios"
            className="text-foreground underline underline-offset-2"
          >
            Formulários
          </Link>
          .
        </p>
        {msg ? <p>{msg}</p> : null}
      </div>
    </div>
  );
}
