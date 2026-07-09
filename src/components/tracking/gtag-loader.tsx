"use client";

import { useEffect, useState } from "react";

import { DynamicGtag } from "@/components/tracking/dynamic-gtag";

/** Fetches active measurement IDs and mounts gtag (for site embed / panel preview). */
export function GtagLoader() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/ga4/ids")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.measurement_ids)) setIds(d.measurement_ids);
      })
      .catch(() => undefined);
  }, []);

  return <DynamicGtag measurementIds={ids} />;
}
