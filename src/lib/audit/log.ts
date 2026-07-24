import "server-only";

import { headers } from "next/headers";

import { query } from "@/lib/db/pool";
import { getClientIpFromHeaders } from "@/lib/tracking/request";

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: "ok" | "error";
  meta?: Record<string, unknown>;
  ip?: string | null;
};

export async function auditLog(input: AuditInput): Promise<void> {
  let ip = input.ip ?? null;
  if (ip == null) {
    try {
      const h = await headers();
      ip = getClientIpFromHeaders(h);
    } catch {
      ip = null;
    }
  }

  try {
    await query(
      `insert into audit_events
         (actor_user_id, action, resource_type, resource_id, ip, result, meta)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.actorUserId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        ip,
        input.result ?? "ok",
        JSON.stringify(input.meta ?? {}),
      ]
    );
  } catch (err) {
    console.error("[audit]", err);
  }
}
