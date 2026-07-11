"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  deleteConnection,
  deleteEventMapping,
  testConnection,
  upsertConnection,
  upsertEventMapping,
} from "@/app/dashboard/integracoes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationModuleDef } from "@/lib/integrations/registry";

type Conn = {
  id: string;
  provider: string;
  label: string;
  active: boolean;
  auth_type: string;
  direction: string;
  account_external_id: string | null;
  hasToken: boolean;
  hasWebhookSecret: boolean;
  config: Record<string, string>;
  webhookUrl?: string;
};

type Mapping = {
  id: string;
  source_provider: string | null;
  source_connection_id: string | null;
  source_event: string;
  dest_connection_id: string;
  dest_event_name: string;
  enabled: boolean;
  dest_label?: string;
};

export function IntegrationsHub({
  modules,
  connections,
  mappings,
  appUrl,
}: {
  modules: IntegrationModuleDef[];
  connections: Conn[];
  mappings: Mapping[];
  appUrl: string;
}) {
  const [pending, start] = useTransition();

  function onUpsert(formData: FormData) {
    start(async () => {
      try {
        await upsertConnection(formData);
        toast.success("Conexão salva");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  function onDelete(id: string) {
    start(async () => {
      try {
        await deleteConnection(id);
        toast.success("Conexão removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function onTest(id: string) {
    start(async () => {
      try {
        const r = await testConnection(id);
        if (r.ok) toast.success("Teste OK");
        else toast.error("Teste falhou");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro no teste");
      }
    });
  }

  function onMapping(formData: FormData) {
    start(async () => {
      try {
        await upsertEventMapping(formData);
        toast.success("Mapeamento salvo");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function onDeleteMapping(id: string) {
    start(async () => {
      try {
        await deleteEventMapping(id);
        toast.success("Mapeamento removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  const outbound = connections.filter(
    (c) => c.direction === "outbound" || c.direction === "both"
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((mod) => {
          const list = connections.filter((c) => c.provider === mod.provider);
          const connectable = mod.authType !== "none" || mod.provider === "snippet";
          return (
            <Card key={mod.provider} className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{mod.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
                <p className="text-xs text-muted-foreground">
                  {list.length} conectada(s)
                  {mod.phase > 1 ? ` · fase ${mod.phase}` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className="space-y-2 rounded-lg border border-border/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {c.account_external_id || c.id.slice(0, 8)}
                          {!c.active ? " · inativa" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {(mod.provider === "meta_pixel" ||
                          mod.provider === "ga4" ||
                          mod.provider === "meta_ads") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onTest(c.id)}
                          >
                            Testar
                          </Button>
                        )}
                        {mod.provider !== "snippet" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => onDelete(c.id)}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                    {(c.direction === "inbound" || c.direction === "both") &&
                      mod.authType === "webhook_secret" && (
                        <p className="break-all font-mono text-[11px] text-muted-foreground">
                          Webhook: {appUrl}/api/webhook/in/{c.id}
                        </p>
                      )}
                  </div>
                ))}

                {connectable && mod.provider !== "snippet" && (
                  <form action={onUpsert} className="space-y-2 border-t border-border/40 pt-3">
                    <input type="hidden" name="provider" value={mod.provider} />
                    <input type="hidden" name="active" value="true" />
                    {mod.connectFields.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label htmlFor={`${mod.provider}-${f.key}`}>{f.label}</Label>
                        <Input
                          id={`${mod.provider}-${f.key}`}
                          name={f.key}
                          type={f.secret ? "password" : "text"}
                          required={f.required && !f.secret ? true : undefined}
                          placeholder={f.placeholder}
                          autoComplete="off"
                        />
                      </div>
                    ))}
                    {mod.authType === "oauth" && (
                      <p className="text-xs text-muted-foreground">
                        OAuth: configure CLIENT_ID/SECRET no Portainer e use
                        /api/integrations/{mod.provider}/oauth/start
                      </p>
                    )}
                    <Button type="submit" size="sm" disabled={pending} className="w-full">
                      Conectar {mod.name}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Mapeamento de eventos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fonte → destino (um evento pode ir para vários Meta/GA4).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-2">Fonte</th>
                  <th className="py-2 pr-2">Evento</th>
                  <th className="py-2 pr-2">Destino</th>
                  <th className="py-2 pr-2">Nome destino</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-b border-border/40">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {m.source_provider ?? m.source_connection_id?.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-2">{m.source_event}</td>
                    <td className="py-2 pr-2">{m.dest_label ?? m.dest_connection_id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{m.dest_event_name}</td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onDeleteMapping(m.id)}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={onMapping} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label>Provider fonte</Label>
              <Input name="source_provider" placeholder="snippet / hotmart" required />
            </div>
            <div className="space-y-1">
              <Label>Evento fonte</Label>
              <Input name="source_event" placeholder="Lead / Purchase" required />
            </div>
            <div className="space-y-1">
              <Label>Destino</Label>
              <select
                name="dest_connection_id"
                required
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Selecione</option>
                {outbound.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.provider})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Nome no destino</Label>
              <Input name="dest_event_name" placeholder="Purchase / generate_lead" required />
            </div>
            <div className="flex items-end">
              <input type="hidden" name="enabled" value="true" />
              <Button type="submit" disabled={pending} className="w-full">
                Adicionar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
