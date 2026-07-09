"use client";

import { useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** Rough country centroids for marker placement (ISO alpha-2). */
const CENTROIDS: Record<string, [number, number]> = {
  BR: [-51.9, -14.2],
  US: [-98.5, 39.8],
  PT: [-8.2, 39.4],
  AR: [-64.0, -34.0],
  MX: [-102.5, 23.6],
  ES: [-3.7, 40.4],
  CO: [-74.3, 4.6],
  CL: [-71.5, -35.7],
  PE: [-75.0, -9.2],
  UY: [-55.8, -32.5],
};

export type GeoPoint = {
  country: string;
  count: number;
};

export function GeoMap({ points }: { points: GeoPoint[] }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  const markers = useMemo(
    () =>
      points
        .map((p) => {
          const c = CENTROIDS[p.country.toUpperCase()];
          if (!c) return null;
          return { ...p, coordinates: c };
        })
        .filter(Boolean) as Array<GeoPoint & { coordinates: [number, number] }>,
    [points]
  );

  return (
    <div className="w-full overflow-hidden rounded-[var(--radius)] border bg-muted/20">
      <ComposableMap projectionConfig={{ scale: 140 }} className="h-auto w-full">
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="hsl(222 18% 18%)"
                stroke="hsl(220 16% 28%)"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "hsl(222 18% 24%)" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>
        {markers.map((m) => (
          <Marker key={m.country} coordinates={m.coordinates}>
            <circle
              r={4 + (m.count / max) * 10}
              fill="hsl(142 76% 58%)"
              fillOpacity={0.75}
              stroke="hsl(142 76% 40%)"
              strokeWidth={1}
            />
            <title>
              {m.country}: {m.count}
            </title>
          </Marker>
        ))}
      </ComposableMap>
      <ul className="flex flex-wrap gap-3 border-t p-3 text-xs">
        {points.map((p) => (
          <li key={p.country} className="font-mono tabular-nums">
            <span className="text-primary">{p.country}</span> {p.count}
          </li>
        ))}
        {!points.length ? (
          <li className="text-muted-foreground">Sem dados geo ainda</li>
        ) : null}
      </ul>
    </div>
  );
}
