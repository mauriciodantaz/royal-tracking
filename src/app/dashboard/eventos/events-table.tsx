"use client";

import { useEffect, useRef, useState } from "react";

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
import { ingestPathLabel } from "@/lib/dashboard/ingest-path-label";

export type { EventRow };

const POLL_MS = 3000;
const HIGHLIGHT_MS = 4000;
const SEARCH_DEBOUNCE_MS = 300;

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

function rowFingerprint(e: EventRow): string {
  return [
    e.id,
    e.ingest_path ?? "",
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

function mergePolledEvents(
  prev: EventRow[],
  polled: EventRow[]
): { rows: EventRow[]; addedIds: string[] } {
  const polledById = new Map(polled.map((p) => [p.id, p]));
  let changed = false;
  const replaced = prev.map((r) => {
    const n = polledById.get(r.id);
    if (!n) return r;
    if (rowFingerprint(n) === rowFingerprint(r)) return r;
    changed = true;
    return n;
  });
  const prevIds = new Set(prev.map((r) => r.id));
  const added = polled.filter((p) => !prevIds.has(p.id));
  if (!changed && added.length === 0) {
    return { rows: prev, addedIds: [] };
  }
  return { rows: [...added, ...replaced], addedIds: added.map((r) => r.id) };
}

type EventsPageResponse = {
  events?: EventRow[];
  nextCursor?: string | null;
};

async function fetchEventsPage(opts: {
  q?: string;
  cursor?: string | null;
}): Promise<EventsPageResponse> {
  const params = new URLSearchParams();
  const q = opts.q?.trim();
  if (q) params.set("q", q);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const res = await fetch(`/api/dashboard/events${qs ? `?${qs}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("fetch_failed");
  }
  return (await res.json()) as EventsPageResponse;
}

export function EventsTable({
  events,
  nextCursor: initialCursor,
}: {
  events: EventRow[];
  nextCursor: string | null;
}) {
  const [rows, setRows] = useState(events);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cursor, setCursor] = useState(initialCursor);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [live, setLive] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set());
  const rowsRef = useRef(events);
  const skipSearchFetch = useRef(true);
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  function flashIds(addedIds: string[]) {
    if (!addedIds.length) return;
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

  function applyPoll(next: EventRow[], flashNew: boolean) {
    const { rows: merged, addedIds } = mergePolledEvents(rowsRef.current, next);
    if (merged === rowsRef.current) return;
    rowsRef.current = merged;
    setRows(merged);
    if (flashNew) flashIds(addedIds);
  }

  useEffect(() => {
    rowsRef.current = events;
    setRows(events);
    setCursor(initialCursor);
  }, [events, initialCursor]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (skipSearchFetch.current) {
      skipSearchFetch.current = false;
      return;
    }
    let cancelled = false;
    setSearching(true);
    void (async () => {
      try {
        const data = await fetchEventsPage({ q: debouncedQ });
        if (cancelled) return;
        const next = data.events ?? [];
        rowsRef.current = next;
        setRows(next);
        setCursor(data.nextCursor ?? null);
        setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }

      try {
        const data = await fetchEventsPage({ q: debouncedQ });
        if (cancelled) return;
        setLive(true);
        applyPoll(data.events ?? [], true);
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
  }, [debouncedQ]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchEventsPage({ q: debouncedQ, cursor });
      const extra = data.events ?? [];
      const existing = new Set(rowsRef.current.map((r) => r.id));
      const appended = extra.filter((e) => !existing.has(e.id));
      const merged = [...rowsRef.current, ...appended];
      rowsRef.current = merged;
      setRows(merged);
      setCursor(data.nextCursor ?? null);
      setLive(true);
    } catch {
      setLive(false);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filtrar por evento, origem, UTM, user…"
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
        {searching ? (
          <span className="text-xs text-muted-foreground">Buscando…</span>
        ) : null}
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
            {rows.map((e) => {
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
                    {ingestPathLabel(e.ingest_path)}
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
            {!rows.length ? (
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
      {cursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}

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
                Origem: {ingestPathLabel(selected.ingest_path)}
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
