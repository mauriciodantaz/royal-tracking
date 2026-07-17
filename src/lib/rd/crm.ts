import "server-only";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  rdCrmFetch,
  unwrapDataList,
  unwrapDataObject,
} from "@/lib/rd/client";

export type RdPipeline = { id: string; name: string; order?: number };
export type RdStage = {
  id: string;
  name: string;
  order?: number;
  pipeline_id?: string;
};

export async function listCrmPipelines(
  conn: IntegrationConnectionRow
): Promise<RdPipeline[]> {
  const { res, json } = await rdCrmFetch(conn, "/pipelines");
  if (!res.ok) {
    const detail =
      json && typeof json === "object"
        ? JSON.stringify(json).slice(0, 180)
        : "";
    throw new Error(
      `CRM list pipelines HTTP ${res.status}${detail ? `: ${detail}` : ""}. Se acabou de conectar, reconecte com OAuth (app CRM, não Marketing).`
    );
  }
  return unwrapDataList(json)
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Funil"),
      order: typeof row.order === "number" ? row.order : undefined,
    }))
    .filter((p) => p.id);
}

export async function listCrmStages(
  conn: IntegrationConnectionRow,
  pipelineId: string
): Promise<RdStage[]> {
  const { res, json } = await rdCrmFetch(
    conn,
    `/pipelines/${encodeURIComponent(pipelineId)}/stages`
  );
  if (!res.ok) {
    throw new Error(`CRM list stages HTTP ${res.status}`);
  }
  return unwrapDataList(json)
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Estágio"),
      order: typeof row.order === "number" ? row.order : undefined,
      pipeline_id: pipelineId,
    }))
    .filter((s) => s.id);
}

export async function getCrmDeal(
  conn: IntegrationConnectionRow,
  dealId: string
): Promise<Record<string, unknown> | null> {
  const { res, json } = await rdCrmFetch(
    conn,
    `/deals/${encodeURIComponent(dealId)}`
  );
  if (!res.ok) return null;
  return unwrapDataObject(json);
}

export async function getCrmContact(
  conn: IntegrationConnectionRow,
  contactId: string
): Promise<Record<string, unknown> | null> {
  const { res, json } = await rdCrmFetch(
    conn,
    `/contacts/${encodeURIComponent(contactId)}`
  );
  if (!res.ok) return null;
  return unwrapDataObject(json);
}

export async function createCrmWebhook(
  conn: IntegrationConnectionRow,
  input: {
    eventName: "crm_deal_created" | "crm_deal_updated";
    url: string;
    authHeader: string;
    authKey: string;
  }
): Promise<{ id: string } | null> {
  const { res, json } = await rdCrmFetch(conn, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      data: {
        event_name: input.eventName,
        http_method: "POST",
        url: input.url,
        auth_header: input.authHeader,
        auth_key: input.authKey,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `CRM create webhook ${input.eventName} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`
    );
  }
  const data = unwrapDataObject(json);
  const id = data?.id != null ? String(data.id) : null;
  return id ? { id } : null;
}

export async function deleteCrmWebhook(
  conn: IntegrationConnectionRow,
  webhookId: string
): Promise<void> {
  await rdCrmFetch(conn, `/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
  });
}

export function extractContactEmailPhone(contact: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
  name: string | null;
} {
  let email: string | null = null;
  let phone: string | null = null;
  const name = typeof contact.name === "string" ? contact.name : null;

  const emails = contact.emails;
  if (Array.isArray(emails)) {
    for (const e of emails) {
      if (e && typeof e === "object") {
        const emailObj = e as Record<string, unknown>;
        const v =
          (typeof emailObj.email === "string" && emailObj.email) ||
          (typeof emailObj.value === "string" && emailObj.value) ||
          null;
        if (v) {
          email = v;
          break;
        }
      } else if (typeof e === "string" && e.includes("@")) {
        email = e;
        break;
      }
    }
  }
  if (!email && typeof contact.email === "string") email = contact.email;

  const phones = contact.phones;
  if (Array.isArray(phones)) {
    for (const p of phones) {
      if (p && typeof p === "object") {
        const phoneObj = p as Record<string, unknown>;
        const v =
          (typeof phoneObj.phone === "string" && phoneObj.phone) ||
          (typeof phoneObj.value === "string" && phoneObj.value) ||
          null;
        if (v) {
          phone = v;
          break;
        }
      } else if (typeof p === "string") {
        phone = p;
        break;
      }
    }
  }
  if (!phone && typeof contact.phone === "string") phone = contact.phone;

  return { email, phone, name };
}
