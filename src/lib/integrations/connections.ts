import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type {
  IntegrationConnectionRow,
  IntegrationEventMappingRow,
  Json,
} from "@/lib/db/types";
import type { IntegrationProvider } from "@/lib/integrations/registry";

export async function listConnections(opts?: {
  provider?: string;
  activeOnly?: boolean;
  direction?: string;
}): Promise<IntegrationConnectionRow[]> {
  await ensureDbReady();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.provider) {
    params.push(opts.provider);
    clauses.push(`provider = $${params.length}`);
  }
  if (opts?.activeOnly) {
    clauses.push(`active = true`);
  }
  if (opts?.direction) {
    params.push(opts.direction);
    clauses.push(`(direction = $${params.length} or direction = 'both')`);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result = await query<IntegrationConnectionRow>(
    `select * from integration_connections ${where} order by provider, label`
  );
  return result.rows;
}

export async function getConnection(
  id: string
): Promise<IntegrationConnectionRow | null> {
  await ensureDbReady();
  return queryOne<IntegrationConnectionRow>(
    `select * from integration_connections where id = $1 limit 1`,
    [id]
  );
}

/** Lookup by short webhook slug (RD Conversas listen-only URLs). */
export async function getConnectionByWebhookSlug(
  slug: string
): Promise<IntegrationConnectionRow | null> {
  await ensureDbReady();
  const clean = slug.trim();
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(clean)) return null;
  return queryOne<IntegrationConnectionRow>(
    `select * from integration_connections
     where active = true
       and provider = 'rdstation_conversas'
       and config->>'webhook_slug' = $1
     limit 1`,
    [clean]
  );
}

export async function getSnippetConnection(): Promise<IntegrationConnectionRow | null> {
  await ensureDbReady();
  return queryOne<IntegrationConnectionRow>(
    `select * from integration_connections
     where provider = 'snippet' and active = true
     order by created_at asc limit 1`
  );
}

export function configString(
  conn: IntegrationConnectionRow,
  key: string
): string | null {
  const cfg = conn.config;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return null;
  const v = (cfg as Record<string, Json | undefined>)[key];
  return typeof v === "string" ? v : null;
}

export async function decryptAccessToken(
  conn: IntegrationConnectionRow
): Promise<string | null> {
  if (!conn.access_token_cipher) return null;
  return decryptSecret(conn.access_token_cipher);
}

export async function decryptWebhookSecret(
  conn: IntegrationConnectionRow
): Promise<string | null> {
  if (!conn.webhook_secret_cipher) return null;
  return decryptSecret(conn.webhook_secret_cipher);
}

export async function loadMappings(opts: {
  sourceConnectionId?: string | null;
  sourceProvider?: string | null;
  sourceEvent: string;
}): Promise<IntegrationEventMappingRow[]> {
  await ensureDbReady();

  if (opts.sourceConnectionId) {
    const byConn = await query<IntegrationEventMappingRow>(
      `select m.*
       from integration_event_mappings m
       join integration_connections d on d.id = m.dest_connection_id and d.active = true
       where m.enabled = true
         and m.source_event = $1
         and m.source_connection_id = $2
       order by m.created_at`,
      [opts.sourceEvent, opts.sourceConnectionId]
    );
    if (byConn.rows.length > 0) return byConn.rows;
  }

  if (opts.sourceProvider) {
    const byProvider = await query<IntegrationEventMappingRow>(
      `select m.*
       from integration_event_mappings m
       join integration_connections d on d.id = m.dest_connection_id and d.active = true
       where m.enabled = true
         and m.source_event = $1
         and m.source_provider = $2
       order by m.created_at`,
      [opts.sourceEvent, opts.sourceProvider]
    );
    return byProvider.rows;
  }

  return [];
}

/** When no mappings exist, fan-out to all active Meta + GA4. */
export async function defaultOutboundTargets(
  sourceEvent: string
): Promise<
  Array<{ dest: IntegrationConnectionRow; destEventName: string }>
> {
  const dests = await listConnections({ activeOnly: true });
  const out: Array<{ dest: IntegrationConnectionRow; destEventName: string }> =
    [];
  for (const d of dests) {
    if (d.provider === "meta_pixel") {
      out.push({ dest: d, destEventName: sourceEvent });
    } else if (d.provider === "ga4") {
      const gaName =
        sourceEvent === "Lead"
          ? "generate_lead"
          : sourceEvent === "Purchase"
            ? "purchase"
            : sourceEvent === "PageView"
              ? "page_view"
              : sourceEvent.toLowerCase();
      out.push({ dest: d, destEventName: gaName });
    }
  }
  return out;
}

export async function resolveDispatchTargets(opts: {
  sourceConnectionId?: string | null;
  sourceProvider: IntegrationProvider | string;
  sourceEvent: string;
}): Promise<
  Array<{ dest: IntegrationConnectionRow; destEventName: string }>
> {
  const mappings = await loadMappings({
    sourceConnectionId: opts.sourceConnectionId,
    sourceProvider: opts.sourceProvider,
    sourceEvent: opts.sourceEvent,
  });

  if (mappings.length === 0) {
    return defaultOutboundTargets(opts.sourceEvent);
  }

  const targets: Array<{
    dest: IntegrationConnectionRow;
    destEventName: string;
  }> = [];
  for (const m of mappings) {
    const dest = await getConnection(m.dest_connection_id);
    if (!dest || !dest.active) continue;
    targets.push({ dest, destEventName: m.dest_event_name });
  }
  return targets;
}

export async function logDelivery(input: {
  eventId: string;
  connectionId: string | null;
  provider: string;
  destEventName?: string;
  status: string;
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: string;
}): Promise<void> {
  await ensureDbReady();
  await query(
    `insert into integration_delivery_log (
       event_id, connection_id, provider, dest_event_name, status,
       http_status, request_payload, response_payload, error
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      input.eventId,
      input.connectionId,
      input.provider,
      input.destEventName ?? null,
      input.status,
      input.httpStatus ?? null,
      input.requestPayload != null
        ? JSON.stringify(input.requestPayload)
        : null,
      input.responsePayload != null
        ? JSON.stringify(input.responsePayload)
        : null,
      input.error ?? null,
    ]
  );
}

export async function seedDefaultMappingsForOutbound(
  destConnectionId: string,
  provider: string
): Promise<void> {
  await ensureDbReady();
  const events =
    provider === "ga4"
      ? [
          ["Lead", "generate_lead"],
          ["Purchase", "purchase"],
          ["PageView", "page_view"],
        ]
      : [
          ["Lead", "Lead"],
          ["Purchase", "Purchase"],
          ["PageView", "PageView"],
        ];

  for (const [sourceEvent, destEvent] of events) {
    await query(
      `insert into integration_event_mappings (
         source_provider, source_event, dest_connection_id, dest_event_name, enabled
       )
       select $1, $2, $3, $4, true
       where not exists (
         select 1 from integration_event_mappings
         where source_provider = $1 and source_event = $2 and dest_connection_id = $3
       )`,
      ["snippet", sourceEvent, destConnectionId, destEvent]
    );
    for (const src of ["hotmart", "kiwify", "eduzz"] as const) {
      if (sourceEvent !== "Purchase") continue;
      await query(
        `insert into integration_event_mappings (
           source_provider, source_event, dest_connection_id, dest_event_name, enabled
         )
         select $1, $2, $3, $4, true
         where not exists (
           select 1 from integration_event_mappings
           where source_provider = $1 and source_event = $2 and dest_connection_id = $3
         )`,
        [src, "Purchase", destConnectionId, destEvent]
      );
    }
    for (const src of ["evolution_api", "uazapi"] as const) {
      if (sourceEvent !== "Lead") continue;
      await query(
        `insert into integration_event_mappings (
           source_provider, source_event, dest_connection_id, dest_event_name, enabled
         )
         select $1, $2, $3, $4, true
         where not exists (
           select 1 from integration_event_mappings
           where source_provider = $1 and source_event = $2 and dest_connection_id = $3
         )`,
        [src, "Lead", destConnectionId, destEvent]
      );
    }
  }
}
