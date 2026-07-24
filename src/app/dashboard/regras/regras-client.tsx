"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SnippetSettings } from "@/lib/tracking/snippet-config";

import {
  addSimplePathRule,
  deleteSnippetRule,
  previewRuleUrl,
  saveSnippetDiscoverySettings,
} from "./actions";

export function RegrasClient({ settings }: { settings: SnippetSettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Flags de descoberta</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            action={(fd) => {
              start(async () => {
                const res = await saveSnippetDiscoverySettings(fd);
                setMsg(res.ok ? "Salvo." : res.error);
              });
            }}
          >
            <input
              type="hidden"
              name="rules_json"
              value={JSON.stringify(settings.rules)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="auto_ecommerce"
                defaultChecked={settings.auto_ecommerce}
              />
              Auto ecommerce (view_item / cart / checkout / purchase por URL)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="listen_datalayer"
                defaultChecked={settings.listen_datalayer}
              />
              Escutar dataLayer.push (GA4 ecommerce)
            </label>
            <div>
              <label className="text-xs text-muted-foreground">
                Query params a preservar na URL canônica (vírgula ou linha)
              </label>
              <textarea
                name="url_preserve_params"
                defaultValue={settings.url_preserve_params.join("\n")}
                className="mt-1 min-h-[72px] w-full max-w-lg rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="categoria&#10;page"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Salvar flags
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Nova regra por path</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            action={(fd) => {
              start(async () => {
                const res = await addSimplePathRule(fd);
                setMsg(res.ok ? "Regra adicionada." : res.error);
              });
            }}
          >
            <div>
              <label className="text-xs text-muted-foreground">
                Path contém
              </label>
              <Input name="path_contains" placeholder="checkout" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ação</label>
              <select
                name="action"
                className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                defaultValue="force_event"
              >
                <option value="force_event">Forçar evento</option>
                <option value="map_event_name">Mapear nome</option>
                <option value="exclude_pageview">Excluir PageView</option>
                <option value="exclude_lead">Excluir Lead</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Nome do evento
              </label>
              <Input name="event_name" placeholder="begin_checkout" />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Regras ativas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra custom. Exclusões built-in (wp-admin, logout,
              preview) já estão ativas no snippet.
            </p>
          ) : (
            settings.rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-sm"
              >
                <div>
                  <p className="font-medium">{r.name || r.id}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {r.action}
                    {r.event_name ? ` → ${r.event_name}` : ""} ·{" "}
                    {r.conditions
                      .map((c) => `${c.field} ${c.op} ${c.value ?? ""}`)
                      .join(` ${r.match} `)}
                  </p>
                </div>
                <form
                  action={(fd) => {
                    start(async () => {
                      const res = await deleteSnippetRule(fd);
                      setMsg(res.ok ? "Removida." : res.error);
                    });
                  }}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Remover
                  </Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Preview de URL</CardTitle>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" size="sm" disabled={pending}>
              Testar
            </Button>
          </form>
          {preview ? (
            <pre className="mt-3 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
              {preview}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
