"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  CustomEventsPanel,
  type CustomEventListItem,
} from "./custom-events-panel";
import { EventsTable, type EventRow } from "./events-table";

export function EventsPageClient({
  events,
  nextCursor,
  customEvents,
}: {
  events: EventRow[];
  nextCursor: string | null;
  customEvents: CustomEventListItem[];
}) {
  const [tab, setTab] = useState<"log" | "custom">("log");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de envio e catálogo de eventos personalizados. O slug
          interno fica no log; os nomes Meta/GA4 aparecem no payload de cada
          destino.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "log" ? "default" : "outline"}
          onClick={() => setTab("log")}
        >
          Log
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "custom" ? "default" : "outline"}
          onClick={() => setTab("custom")}
        >
          Personalizados
        </Button>
      </div>
      {tab === "log" ? (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <EventsTable events={events} nextCursor={nextCursor} />
          </CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Eventos personalizados</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomEventsPanel events={customEvents} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
