import "server-only";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  pipedriveFetch,
  unwrapDataList,
  unwrapDataObject,
} from "@/lib/pipedrive/client";

export type PipedrivePipeline = { id: string; name: string; order?: number };
export type PipedriveStage = {
  id: string;
  name: string;
  order?: number;
  pipeline_id?: string;
};

export type PipedriveMe = {
  user_id: string | null;
  company_id: string | null;
  company_name: string | null;
  company_domain: string | null;
};

export async function getPipedriveMe(
  conn: IntegrationConnectionRow
): Promise<PipedriveMe | null> {
  const { res, json } = await pipedriveFetch(conn, "/users/me");
  if (!res.ok) return null;
  const data = unwrapDataObject(json);
  if (!data) return null;
  return {
    user_id: data.id != null ? String(data.id) : null,
    company_id: data.company_id != null ? String(data.company_id) : null,
    company_name:
      typeof data.company_name === "string" ? data.company_name : null,
    company_domain:
      typeof data.company_domain === "string" ? data.company_domain : null,
  };
}

export async function listPipelines(
  conn: IntegrationConnectionRow
): Promise<PipedrivePipeline[]> {
  const { res, json } = await pipedriveFetch(conn, "/pipelines");
  if (!res.ok) {
    const detail =
      json && typeof json === "object"
        ? JSON.stringify(json).slice(0, 180)
        : "";
    throw new Error(
      `Pipedrive list pipelines HTTP ${res.status}${detail ? `: ${detail}` : ""}`
    );
  }
  return unwrapDataList(json)
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Funil"),
      order: typeof row.order_nr === "number" ? row.order_nr : undefined,
    }))
    .filter((p) => p.id);
}

export async function listStages(
  conn: IntegrationConnectionRow,
  pipelineId?: string
): Promise<PipedriveStage[]> {
  const qs = pipelineId
    ? `?pipeline_id=${encodeURIComponent(pipelineId)}`
    : "";
  const { res, json } = await pipedriveFetch(conn, `/stages${qs}`);
  if (!res.ok) {
    throw new Error(`Pipedrive list stages HTTP ${res.status}`);
  }
  return unwrapDataList(json)
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Estágio"),
      order: typeof row.order_nr === "number" ? row.order_nr : undefined,
      pipeline_id:
        row.pipeline_id != null
          ? String(row.pipeline_id)
          : pipelineId,
    }))
    .filter((s) => s.id);
}

export async function getDeal(
  conn: IntegrationConnectionRow,
  dealId: string
): Promise<Record<string, unknown> | null> {
  const { res, json } = await pipedriveFetch(
    conn,
    `/deals/${encodeURIComponent(dealId)}`
  );
  if (!res.ok) return null;
  return unwrapDataObject(json);
}

export async function getPerson(
  conn: IntegrationConnectionRow,
  personId: string
): Promise<Record<string, unknown> | null> {
  const { res, json } = await pipedriveFetch(
    conn,
    `/persons/${encodeURIComponent(personId)}`
  );
  if (!res.ok) return null;
  return unwrapDataObject(json);
}

export async function createDealWebhook(
  conn: IntegrationConnectionRow,
  input: {
    url: string;
    httpAuthUser: string;
    httpAuthPassword: string;
    name?: string;
  }
): Promise<{ id: string } | null> {
  const { res, json } = await pipedriveFetch(conn, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      subscription_url: input.url,
      event_action: "*",
      event_object: "deal",
      name: input.name ?? "royal-tracking-deals",
      version: "2.0",
      http_auth_user: input.httpAuthUser,
      http_auth_password: input.httpAuthPassword,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Pipedrive create webhook HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`
    );
  }
  const data = unwrapDataObject(json);
  const id = data?.id != null ? String(data.id) : null;
  return id ? { id } : null;
}

export async function deleteWebhook(
  conn: IntegrationConnectionRow,
  webhookId: string
): Promise<void> {
  await pipedriveFetch(conn, `/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
  });
}

export function extractPersonEmailPhone(person: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
  name: string | null;
} {
  let email: string | null = null;
  let phone: string | null = null;
  const name =
    (typeof person.name === "string" && person.name) ||
    [
      typeof person.first_name === "string" ? person.first_name : "",
      typeof person.last_name === "string" ? person.last_name : "",
    ]
      .join(" ")
      .trim() ||
    null;

  const emails = person.email;
  if (Array.isArray(emails)) {
    for (const e of emails) {
      if (e && typeof e === "object") {
        const emailObj = e as Record<string, unknown>;
        const v =
          (typeof emailObj.value === "string" && emailObj.value) ||
          (typeof emailObj.email === "string" && emailObj.email) ||
          null;
        if (v && v.includes("@")) {
          email = v;
          if (emailObj.primary === true) break;
        }
      } else if (typeof e === "string" && e.includes("@")) {
        email = e;
        break;
      }
    }
  }
  if (!email && typeof person.email === "string" && person.email.includes("@")) {
    email = person.email;
  }

  const phones = person.phone;
  if (Array.isArray(phones)) {
    for (const p of phones) {
      if (p && typeof p === "object") {
        const phoneObj = p as Record<string, unknown>;
        const v =
          (typeof phoneObj.value === "string" && phoneObj.value) ||
          (typeof phoneObj.phone === "string" && phoneObj.phone) ||
          null;
        if (v) {
          phone = v;
          if (phoneObj.primary === true) break;
        }
      } else if (typeof p === "string") {
        phone = p;
        break;
      }
    }
  }
  if (!phone && typeof person.phone === "string") phone = person.phone;

  return { email, phone, name };
}
