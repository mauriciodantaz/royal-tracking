"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type EventRow = {
  id: string;
  event_name: string;
  event_id: string;
  trck_user_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  geo_country: string | null;
  geo_city: string | null;
  created_at: string;
  payload_meta: unknown;
  response_meta: unknown;
  payload_ga4: unknown;
  response_ga4: unknown;
  ingest_path?: string | null;
  channel_class?: string | null;
  web_meta?: boolean | null;
  web_ga4?: boolean | null;
  server_meta?: boolean | null;
  server_ga4?: boolean | null;
};

function channelLabel(c: string | null | undefined): string {
  switch (c) {
    case "web_server":
      return "web+server";
    case "server_only":
      return "só server";
    case "web_only":
      return "só web";
    case "none":
      return "nenhum";
    default:
      return "legado";
  }
}

function hasPayload(data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "object") return Object.keys(data).length > 0;
  return true;
}

/** Destinos que receberam / emitiram o evento (web e/ou server). */
function platformsForEvent(e: EventRow): string[] {
  const out: string[] = [];
  const meta =
    e.web_meta === true ||
    e.server_meta === true ||
    hasPayload(e.payload_meta) ||
    hasPayload(e.response_meta);
  const ga4 =
    e.web_ga4 === true ||
    e.server_ga4 === true ||
    hasPayload(e.payload_ga4) ||
    hasPayload(e.response_ga4);
  if (meta) out.push("Meta");
  if (ga4) out.push("GA4");
  return out;
}

function sourceLabel(ingest: string | null | undefined): string {
  switch (ingest) {
    case "webhook":
      return "Webhook";
    case "snippet":
      return "Snippet";
    case "api":
      return "API";
    default:
      return ingest?.trim() ? ingest : "—";
  }
}

export function EventsTable({ events }: { events: EventRow[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return events;
    return events.filter((e) => {
      const platforms = platformsForEvent(e).join(" ").toLowerCase();
      return (
        e.event_name.toLowerCase().includes(term) ||
        e.event_id.toLowerCase().includes(term) ||
        (e.trck_user_id?.toLowerCase().includes(term) ?? false) ||
        (e.utm_source?.toLowerCase().includes(term) ?? false) ||
        (e.utm_campaign?.toLowerCase().includes(term) ?? false) ||
        channelLabel(e.channel_class).includes(term) ||
        (e.ingest_path?.toLowerCase().includes(term) ?? false) ||
        platforms.includes(term) ||
        sourceLabel(e.ingest_path).toLowerCase().includes(term)
      );
    });
  }, [events, q]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filtrar por evento, Meta, GA4, canal, UTM…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />
      <div className="glass overflow-x-auto rounded-[var(--radius)] border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Plataformas</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>User</TableHead>
              <TableHead>UTM</TableHead>
              <TableHead>Geo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => {
              const platforms = platformsForEvent(e);
              return (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.event_name}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {platforms.length ? (
                      platforms.map((p) => (
                        <Badge
                          key={p}
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {p}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {channelLabel(e.channel_class)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {sourceLabel(e.ingest_path)}
                </TableCell>
                <TableCell className="max-w-[120px] truncate font-mono text-xs">
                  {e.trck_user_id ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {[e.utm_source, e.utm_campaign].filter(Boolean).join(" / ") ||
                    "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {[e.geo_city, e.geo_country].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(e)}
                  >
                    Detalhe
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
            {!filtered.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Nenhum evento
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              {selected?.event_name} · {selected?.event_id}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <p className="text-xs text-muted-foreground">
                Plataformas:{" "}
                {platformsForEvent(selected).join(", ") || "—"}
                {" · "}
                Origem: {sourceLabel(selected.ingest_path)}
                {" · "}
                Canal: {channelLabel(selected.channel_class)}
                {" · "}
                web meta/ga4: {String(!!selected.web_meta)}/
                {String(!!selected.web_ga4)}
                {" · "}
                server meta/ga4: {String(!!selected.server_meta)}/
                {String(!!selected.server_ga4)}
              </p>
              <PayloadBlock title="Meta payload" data={selected.payload_meta} />
              <PayloadBlock title="Meta response" data={selected.response_meta} />
              <PayloadBlock title="GA4 payload" data={selected.payload_ga4} />
              <PayloadBlock title="GA4 response" data={selected.response_ga4} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayloadBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <pre
        data-mono
        className="overflow-x-auto rounded-[var(--radius)] border bg-muted/40 p-3 text-xs"
      >
        {data == null ? "null" : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
