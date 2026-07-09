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
};

export function EventsTable({ events }: { events: EventRow[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (e) =>
        e.event_name.toLowerCase().includes(term) ||
        e.event_id.toLowerCase().includes(term) ||
        (e.trck_user_id?.toLowerCase().includes(term) ?? false) ||
        (e.utm_source?.toLowerCase().includes(term) ?? false) ||
        (e.utm_campaign?.toLowerCase().includes(term) ?? false)
    );
  }, [events, q]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filtrar por evento, id, UTM…"
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
              <TableHead>User</TableHead>
              <TableHead>UTM</TableHead>
              <TableHead>Geo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.event_name}</Badge>
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
            ))}
            {!filtered.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
