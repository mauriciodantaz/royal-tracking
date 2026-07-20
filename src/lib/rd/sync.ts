import "server-only";

import { randomBytes } from "node:crypto";

import { encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  decryptWebhookSecret,
  getConnection,
} from "@/lib/integrations/connections";
import { ensureShortWebhookUrl } from "@/lib/integrations/webhook-slug";
import { metadataRecord } from "@/lib/rd/credentials";
import {
  createCrmWebhook,
  deleteCrmWebhook,
  listCrmPipelines,
  listCrmStages,
} from "@/lib/rd/crm";
import {
  createMktWebhook,
  deleteMktWebhook,
  MKT_LIFECYCLE_SLOTS,
} from "@/lib/rd/mkt";

function defaultMetaForIndex(index: number, total: number): string {
  if (total <= 1) return "Lead";
  if (index === 0) return "Lead";
  if (index === total - 1) return "Purchase";
  if (index >= total - 2) return "InitiateCheckout";
  return "Lead";
}

function defaultGa4ForMeta(meta: string): string {
  switch (meta) {
    case "Purchase":
      return "purchase";
    case "InitiateCheckout":
      return "begin_checkout";
    case "CompleteRegistration":
      return "sign_up";
    default:
      return "generate_lead";
  }
}

export async function syncRdFunnels(
  connectionId: string
): Promise<{ pipelines: number; stages: number }> {
  await ensureDbReady();
  const conn = await getConnection(connectionId);
  if (!conn) throw new Error("connection_not_found");

  if (conn.provider === "rdstation_mkt") {
    return seedMktLifecycleSlots(conn);
  }
  if (conn.provider !== "rdstation_crm") {
    throw new Error("not_rd_connection");
  }

  const pipelines = await listCrmPipelines(conn);
  let stageCount = 0;

  for (const pipeline of pipelines) {
    const pipeRow = await queryOne<{ id: string }>(
      `insert into rd_pipelines (connection_id, external_id, name, raw, updated_at)
       values ($1,$2,$3,$4::jsonb, now())
       on conflict (connection_id, external_id) do update set
         name = excluded.name,
         raw = excluded.raw,
         updated_at = now()
       returning id`,
      [
        conn.id,
        pipeline.id,
        pipeline.name,
        JSON.stringify(pipeline),
      ]
    );
    if (!pipeRow) continue;

    const stages = await listCrmStages(conn, pipeline.id);
    const ordered = [...stages].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    stageCount += ordered.length;

    for (let i = 0; i < ordered.length; i++) {
      const stage = ordered[i]!;
      await query(
        `insert into rd_stages (
           connection_id, pipeline_id, external_id, name, stage_order, raw, updated_at
         ) values ($1,$2,$3,$4,$5,$6::jsonb, now())
         on conflict (connection_id, external_id) do update set
           pipeline_id = excluded.pipeline_id,
           name = excluded.name,
           stage_order = excluded.stage_order,
           raw = excluded.raw,
           updated_at = now()`,
        [
          conn.id,
          pipeRow.id,
          stage.id,
          stage.name,
          stage.order ?? i,
          JSON.stringify(stage),
        ]
      );

      const meta = defaultMetaForIndex(i, ordered.length);
      const existingMap = await queryOne<{ id: string }>(
        `select id from rd_stage_event_maps
         where connection_id = $1 and stage_external_id = $2 limit 1`,
        [conn.id, stage.id]
      );
      if (!existingMap) {
        await query(
          `insert into rd_stage_event_maps (
             connection_id, stage_external_id, meta_event_name, ga4_event_name, updated_at
           ) values ($1,$2,$3,$4, now())`,
          [conn.id, stage.id, meta, defaultGa4ForMeta(meta)]
        );
      }
    }
  }

  await seedCrmDealStatusMaps(conn.id);

  return { pipelines: pipelines.length, stages: stageCount };
}

/** Seed won/lost maps (CRM deal status → Meta/GA4). */
export async function seedCrmDealStatusMaps(
  connectionId: string
): Promise<void> {
  const slots: Array<{
    status: "won" | "lost";
    meta: string | null;
    ga4: string | null;
  }> = [
    { status: "won", meta: "Purchase", ga4: "purchase" },
    { status: "lost", meta: null, ga4: null },
  ];

  for (const slot of slots) {
    const existing = await queryOne<{ id: string }>(
      `select id from rd_stage_event_maps
       where connection_id = $1 and deal_status = $2 limit 1`,
      [connectionId, slot.status]
    );
    if (existing) continue;
    await query(
      `insert into rd_stage_event_maps (
         connection_id, deal_status, meta_event_name, ga4_event_name, updated_at
       ) values ($1,$2,$3,$4, now())`,
      [connectionId, slot.status, slot.meta, slot.ga4]
    );
  }
}

async function seedMktLifecycleSlots(
  conn: IntegrationConnectionRow
): Promise<{ pipelines: number; stages: number }> {
  for (const slot of MKT_LIFECYCLE_SLOTS) {
    const existingMap = await queryOne<{ id: string }>(
      `select id from rd_stage_event_maps
       where connection_id = $1 and mkt_lifecycle = $2 limit 1`,
      [conn.id, slot.key]
    );
    if (!existingMap) {
      await query(
        `insert into rd_stage_event_maps (
           connection_id, mkt_lifecycle, meta_event_name, ga4_event_name, updated_at
         ) values ($1,$2,$3,$4, now())`,
        [conn.id, slot.key, slot.metaDefault, slot.ga4Default]
      );
    }
  }
  return { pipelines: 0, stages: MKT_LIFECYCLE_SLOTS.length };
}

async function ensureWebhookSecret(
  conn: IntegrationConnectionRow
): Promise<string> {
  const existing = await decryptWebhookSecret(conn);
  if (existing) return existing;
  const secret = randomBytes(24).toString("hex");
  const cipher = await encryptSecret(secret);
  await query(
    `update integration_connections set
       webhook_secret_cipher = $1,
       updated_at = now()
     where id = $2`,
    [cipher, conn.id]
  );
  return secret;
}

export async function ensureRdWebhooks(
  connectionId: string
): Promise<{ created: string[] }> {
  await ensureDbReady();
  let conn = await getConnection(connectionId);
  if (!conn) throw new Error("connection_not_found");

  const secret = await ensureWebhookSecret(conn);
  conn = (await getConnection(connectionId))!;
  const inboundUrl = await ensureShortWebhookUrl(connectionId);
  const meta = metadataRecord(conn.metadata);
  const webhookIds =
    meta.rd_webhook_ids && typeof meta.rd_webhook_ids === "object"
      ? ({ ...(meta.rd_webhook_ids as Record<string, string>) } as Record<
          string,
          string
        >)
      : {};
  const created: string[] = [];

  if (conn.provider === "rdstation_crm") {
    for (const eventName of ["crm_deal_created", "crm_deal_updated"] as const) {
      if (webhookIds[eventName]) continue;
      const wh = await createCrmWebhook(conn, {
        eventName,
        url: inboundUrl,
        authHeader: "x-webhook-token",
        authKey: secret,
      });
      if (wh?.id) {
        webhookIds[eventName] = wh.id;
        created.push(eventName);
      }
    }
  } else if (conn.provider === "rdstation_mkt") {
    for (const eventType of [
      "WEBHOOK.CONVERTED",
      "WEBHOOK.MARKED_OPPORTUNITY",
    ] as const) {
      if (webhookIds[eventType]) continue;
      const wh = await createMktWebhook(conn, {
        eventType,
        url: inboundUrl,
      });
      if (wh?.uuid) {
        webhookIds[eventType] = wh.uuid;
        created.push(eventType);
      }
    }
  }

  meta.rd_webhook_ids = webhookIds;
  meta.webhooks_configured_at = new Date().toISOString();
  await query(
    `update integration_connections set metadata = $1::jsonb, updated_at = now() where id = $2`,
    [JSON.stringify(meta), conn.id]
  );

  return { created };
}

export async function cleanupRdWebhooks(
  conn: IntegrationConnectionRow
): Promise<void> {
  const meta = metadataRecord(conn.metadata);
  const webhookIds =
    meta.rd_webhook_ids && typeof meta.rd_webhook_ids === "object"
      ? (meta.rd_webhook_ids as Record<string, string>)
      : {};

  for (const [key, id] of Object.entries(webhookIds)) {
    if (!id) continue;
    try {
      if (conn.provider === "rdstation_crm") {
        await deleteCrmWebhook(conn, id);
      } else if (conn.provider === "rdstation_mkt") {
        await deleteMktWebhook(conn, id);
      }
    } catch {
      /* best-effort remote cleanup */
    }
    void key;
  }
}

/** After OAuth: sync funnels + ensure inbound webhooks. */
export async function postOauthRdSetup(connectionId: string): Promise<void> {
  await syncRdFunnels(connectionId);
  try {
    await ensureRdWebhooks(connectionId);
  } catch (err) {
    console.error("[rd] ensureRdWebhooks failed", err);
  }
}
