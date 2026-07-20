import "server-only";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import { processPurchaseEvent } from "@/lib/integrations/process-purchase";
import { processRdWebhook } from "@/lib/rd/process-webhook";
import { parsePurchaseWebhook } from "@/lib/tracking/webhook-parse";
import { processWhatsappMessageWebhook } from "@/lib/whatsapp/process-message";

export type InboundProcessResult =
  | Record<string, unknown> & { ok: true }
  | { ok: false; error: string; status: number };

/** Shared inbound dispatch after auth (UUID route or short /api/w/{slug}). */
export async function processInboundConnection(opts: {
  conn: IntegrationConnectionRow;
  raw: unknown;
}): Promise<InboundProcessResult> {
  const { conn, raw } = opts;

  if (conn.direction === "outbound") {
    return { ok: false, error: "not_inbound", status: 400 };
  }

  const marketplace = ["hotmart", "kiwify", "eduzz"].includes(conn.provider);
  if (marketplace) {
    const parsed = parsePurchaseWebhook(raw);
    const result = await processPurchaseEvent({
      raw,
      parsed,
      sourceProvider: conn.provider,
      sourceConnectionId: conn.id,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status };
    }
    return result;
  }

  if (conn.provider === "rdstation_crm" || conn.provider === "rdstation_mkt") {
    const result = await processRdWebhook({ conn, raw });
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status };
    }
    return result;
  }

  if (
    conn.provider === "evolution_api" ||
    conn.provider === "uazapi" ||
    conn.provider === "rdstation_conversas"
  ) {
    const result = await processWhatsappMessageWebhook({ conn, raw });
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status };
    }
    return result;
  }

  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const sourceEvent =
    (typeof rec?.event === "string" && rec.event) ||
    (typeof rec?.event_name === "string" && rec.event_name) ||
    "Lead";

  if (
    sourceEvent.toLowerCase().includes("purchase") ||
    sourceEvent.toLowerCase().includes("won")
  ) {
    const result = await processPurchaseEvent({
      raw,
      sourceProvider: conn.provider,
      sourceConnectionId: conn.id,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status };
    }
    return result;
  }

  return {
    ok: true,
    received: true,
    provider: conn.provider,
    source_event: sourceEvent,
    note: "CRM lead ingest via dedicated adapters in phase 2; purchase parsers active for marketplaces",
  };
}
