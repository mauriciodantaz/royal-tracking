"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomEventAliasRow, CustomEventRow } from "@/lib/db/types";

import {
  deleteCustomEventAction,
  saveCustomEventAction,
} from "./actions";

export type CustomEventListItem = CustomEventRow & {
  aliases: CustomEventAliasRow[];
};

function paramsToText(value: CustomEventRow["default_params"]): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");
}

function aliasesToText(aliases: CustomEventAliasRow[]): string {
  return aliases
    .map((a) =>
      a.source_provider
        ? `${a.source_provider}:${a.received_name}`
        : a.received_name
    )
    .join("\n");
}

function CustomEventForm({
  initial,
  onDone,
}: {
  initial?: CustomEventListItem;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await saveCustomEventAction(fd);
          if (r.ok) {
            toast.success(initial ? "Evento atualizado" : "Evento criado");
            onDone();
          } else {
            toast.error(r.error);
          }
        })
      }
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="slug">Nome interno (slug)</Label>
        <Input
          id="slug"
          name="slug"
          required
          defaultValue={initial?.slug ?? ""}
          placeholder="orcamento_aprovado"
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="label">Rótulo</Label>
        <Input
          id="label"
          name="label"
          required
          defaultValue={initial?.label ?? ""}
          placeholder="Orçamento aprovado"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meta_event_name">Nome na Meta</Label>
        <Input
          id="meta_event_name"
          name="meta_event_name"
          defaultValue={initial?.meta_event_name ?? ""}
          placeholder="Lead ou nome custom"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ga4_event_name">Nome no GA4</Label>
        <Input
          id="ga4_event_name"
          name="ga4_event_name"
          defaultValue={initial?.ga4_event_name ?? ""}
          placeholder="generate_lead"
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="default_currency">Moeda padrão</Label>
        <Input
          id="default_currency"
          name="default_currency"
          defaultValue={initial?.default_currency ?? ""}
          maxLength={3}
          placeholder="BRL"
          className="font-mono uppercase"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 self-end pb-1 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="meta_enabled"
            defaultChecked={initial?.meta_enabled !== false}
            className="size-4 accent-foreground"
          />
          Enviar Meta
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="ga4_enabled"
            defaultChecked={initial?.ga4_enabled !== false}
            className="size-4 accent-foreground"
          />
          Enviar GA4
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="include_value"
            defaultChecked={initial?.include_value !== false}
            className="size-4 accent-foreground"
          />
          Valor
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="include_items"
            defaultChecked={initial?.include_items === true}
            className="size-4 accent-foreground"
          />
          Itens
        </label>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="default_params">Parâmetros extras (chave=valor)</Label>
        <textarea
          id="default_params"
          name="default_params"
          rows={3}
          defaultValue={paramsToText(initial?.default_params ?? {})}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder={"funil=comercial\norigem=crm"}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="aliases">
          Nomes recebidos (um por linha; opcional origem:nome)
        </Label>
        <textarea
          id="aliases"
          name="aliases"
          rows={3}
          defaultValue={aliasesToText(initial?.aliases ?? [])}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder={"Deal won\npipedrive:negociacao_ganha"}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : initial ? "Salvar alterações" : "Criar evento"}
        </Button>
      </div>
    </form>
  );
}

export function CustomEventsPanel({
  events,
}: {
  events: CustomEventListItem[];
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cadastre um slug interno e os nomes enviados à Meta e ao GA4. Aliases
        mapeiam o nome que chegou na origem para este evento. Eventos nativos
        (Lead, Purchase, PageView) continuam sem cadastro.
      </p>
      {creating ? (
        <CustomEventForm
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : (
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          Novo evento personalizado
        </Button>
      )}
      <ul className="space-y-3">
        {events.map((event) => (
          <li
            key={event.id}
            className="space-y-3 rounded-xl border border-border/50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{event.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {event.slug}
                  {event.active ? "" : " · inativo"}
                  {event.meta_enabled
                    ? ` · Meta ${event.meta_event_name || "—"}`
                    : " · Meta off"}
                  {event.ga4_enabled
                    ? ` · GA4 ${event.ga4_event_name || "—"}`
                    : " · GA4 off"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditingId((id) => (id === event.id ? null : event.id))
                  }
                >
                  {editingId === event.id ? "Fechar" : "Editar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteCustomEventAction(event.id);
                      if (r.ok) toast.success("Evento excluído");
                      else toast.error(r.error);
                    })
                  }
                >
                  Excluir
                </Button>
              </div>
            </div>
            {editingId === event.id ? (
              <CustomEventForm
                initial={event}
                onDone={() => setEditingId(null)}
              />
            ) : null}
          </li>
        ))}
        {events.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Nenhum evento personalizado ainda.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
