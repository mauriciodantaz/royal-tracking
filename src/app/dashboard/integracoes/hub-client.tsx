"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Plug, Trash2 } from "lucide-react";

import {
  deleteConnection,
  testConnection,
} from "@/app/dashboard/integracoes/actions";
import { Button } from "@/components/ui/button";
import { getModule } from "@/lib/integrations/registry";

export type ActiveConn = {
  id: string;
  provider: string;
  label: string;
  active: boolean;
  direction: string;
  account_external_id: string | null;
};

function directionLabel(d: string) {
  switch (d) {
    case "inbound":
      return "Fonte";
    case "outbound":
      return "Destino";
    case "both":
      return "Fonte e destino";
    default:
      return d;
  }
}

export function ActiveIntegrationsList({
  connections,
}: {
  connections: ActiveConn[];
}) {
  const [pending, start] = useTransition();

  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center">
        <Plug className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Nenhuma integração conectada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um módulo na galeria abaixo para começar.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
      {connections.map((c) => {
        const mod = getModule(c.provider);
        return (
          <li
            key={c.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{c.label}</p>
                <span
                  className={
                    c.active
                      ? "rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                      : "rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  }
                >
                  {c.active ? "Operando" : "Inativa"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mod?.name ?? c.provider} · {directionLabel(c.direction)}
                {c.account_external_id
                  ? ` · ${c.account_external_id}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/dashboard/integracoes/${c.provider}`} />}
              >
                Gerenciar
              </Button>
              {(c.provider === "meta_pixel" ||
                c.provider === "ga4" ||
                c.provider === "meta_ads") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const r = await testConnection(c.id);
                        if (r.ok) toast.success("Teste OK");
                        else toast.error("Teste falhou");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erro no teste"
                        );
                      }
                    })
                  }
                >
                  Testar
                </Button>
              )}
              {c.provider !== "snippet" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        await deleteConnection(c.id);
                        toast.success("Integração removida");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erro ao remover"
                        );
                      }
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ModuleGallery({
  modules,
  connectedCounts,
}: {
  modules: Array<{
    provider: string;
    name: string;
    description: string;
    direction: string;
  }>;
  connectedCounts: Record<string, number>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((mod) => {
        const count = connectedCounts[mod.provider] ?? 0;
        return (
          <div
            key={mod.provider}
            className="flex flex-col rounded-xl border border-border/60 p-4 transition-colors hover:border-border hover:bg-muted/30"
          >
            <div className="mb-3">
              <h3 className="text-sm font-semibold tracking-tight">
                {mod.name}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {directionLabel(mod.direction)}
                {count > 0 ? ` · ${count} conectada(s)` : ""}
              </p>
            </div>
            <p className="mb-4 flex-1 text-sm text-muted-foreground">
              {mod.description}
            </p>
            <Button
              className="w-full justify-between"
              size="sm"
              render={
                <Link href={`/dashboard/integracoes/${mod.provider}`} />
              }
            >
              Adicionar integração
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
