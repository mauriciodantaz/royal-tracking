"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import type { EventRow } from "@/lib/dashboard/event-types";

export type { EventRow };

const POLL_MS = 3000;
const HIGHLIGHT_MS = 4000;

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

function rowFingerprint(e: EventRow): string {
  return [
    e.id,
    e.channel_class ?? "",
    e.web_meta ? "1" : "0",
    e.web_ga4 ? "1" : "0",
    e.server_meta ? "1" : "0",
    e.server_ga4 ? "1" : "0",
    hasPayload(e.payload_meta) ? "1" : "0",
    hasPayload(e.response_meta) ? "1" : "0",
    hasPayload(e.payload_ga4) ? "1" : "0",
    hasPayload(e.response_ga4) ? "1" : "0",
  ].join("|");
}

function listFingerprint(rows: EventRow[]): string {
  return rows.map(rowFingerprint).join(";");
}

function mergeEvents(
  prev: EventRow[],
  next: EventRow[]
): { rows: EventRow[]; addedIds: string[] } {
  if (listFingerprint(prev) === listFingerprint(next)) {
    return { rows: prev, addedIds: [] };
  }

  const prevIds = new Set(prev.map((r) => r.id));
  const addedIds = next.filter((r) => !prevIds.has(r.id)).map((r) => r.id);
  return { rows: next, addedIds };
}

export function EventsTable({ events }: { events: EventRow[] }) {
  const [rows, setRows] = useState(events);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [live, setLive] = useState(true);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set());
  const rowsRef = useRef(events);
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  function applyEvents(next: EventRow[], flashNew: boolean) {
    const { rows: merged, addedIds } = mergeEvents(rowsRef.current, next);
    if (merged === rowsRef.current) return;
    rowsRef.current = merged;
    setRows(merged);

    if (!flashNew || !addedIds.length) return;

    setHighlightIds((old) => {
      const copy = new Set(old);
      for (const id of addedIds) copy.add(id);
      return copy;
    });

    for (const id of addedIds) {
      const prevTimer = highlightTimers.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      const timer = setTimeout(() => {
        highlightTimers.current.delete(id);
        setHighlightIds((old) => {
          if (!old.has(id)) return old;
          const copy = new Set(old);
          copy.delete(id);
          return copy;
        });
      }, HIGHLIGHT_MS);
      highlightTimers.current.set(id, timer);
    }
  }

  useEffect(() => {
    applyEvents(events, false);
  }, [events]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }

      try {
        const res = await fetch("/api/dashboard/events", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLive(false);
          schedule();
          return;
        }
        const data = (await res.json()) as { events?: EventRow[] };
        if (cancelled) return;
        setLive(true);
        applyEvents(data.events ?? [], true);
      } catch {
        if (!cancelled) setLive(false);
      }

      schedule();
    }

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(() => {
        void tick();
      }, POLL_MS);
    }

    schedule();

    function onVisibility() {
      if (document.visibilityState === "visible" && !cancelled) {
        void tick();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const t of highlightTimers.current.values()) clearTimeout(t);
      highlightTimers.current.clear();
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((e) => {
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
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filtrar por evento, Meta, GA4, canal, UTM…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={
              live
                ? "size-1.5 rounded-full bg-emerald-500"
                : "size-1.5 rounded-full bg-muted-foreground/50"
            }
            aria-hidden
          />
          {live ? "Ao vivo" : "Reconectando…"}
        </span>
      </div>
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
              const highlight = highlightIds.has(e.id);
              return (
                <TableRow
                  key={e.id}
                  className={
                    highlight
                      ? "bg-emerald-500/10 transition-colors duration-700"
                      : "transition-colors duration-700"
                  }
                >
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
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                >
                  Nenhum evento
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="flex h-[70vh] max-h-[900px] w-[70vw] max-w-[1200px] flex-col gap-4 overflow-hidden p-6 sm:max-w-[1200px]">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="break-all font-mono text-base">
              {selected?.event_name} · {selected?.event_id}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-sm">
              <p className="text-xs break-words text-muted-foreground">
                Plataformas: {platformsForEvent(selected).join(", ") || "—"}
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
              <PayloadBlock
                title="Meta response"
                data={selected.response_meta}
              />
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
    <div className="min-w-0">
      <p className="mb-1 font-medium">{title}</p>
      <pre
        data-mono
        className="max-w-full whitespace-pre-wrap break-all rounded-[var(--radius)] border bg-muted/40 p-3 text-xs leading-relaxed"
      >
        {data == null ? "null" : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
