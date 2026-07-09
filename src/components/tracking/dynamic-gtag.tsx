"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads gtag.js dynamically for each measurement_id (from config, not hardcoded).
 * Browser events only — do not duplicate via Measurement Protocol.
 */
export function DynamicGtag({ measurementIds }: { measurementIds: string[] }) {
  useEffect(() => {
    if (!measurementIds.length || typeof window === "undefined") return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());

    for (const id of measurementIds) {
      if (document.querySelector(`script[data-ga4="${id}"]`)) {
        window.gtag("config", id, { send_page_view: true });
        continue;
      }
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      s.dataset.ga4 = id;
      document.head.appendChild(s);
      window.gtag("config", id, { send_page_view: true });
    }
  }, [measurementIds]);

  return null;
}
