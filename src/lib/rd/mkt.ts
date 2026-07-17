import "server-only";

import type { IntegrationConnectionRow } from "@/lib/db/types";
import { rdMktFetch } from "@/lib/rd/client";

export const MKT_LIFECYCLE_SLOTS = [
  {
    key: "lead",
    label: "Lead",
    metaDefault: "Lead",
    ga4Default: "generate_lead",
  },
  {
    key: "qualified",
    label: "Qualified",
    metaDefault: "Lead",
    ga4Default: "generate_lead",
  },
  {
    key: "opportunity",
    label: "Opportunity",
    metaDefault: "InitiateCheckout",
    ga4Default: "begin_checkout",
  },
  {
    key: "sale",
    label: "Sale",
    metaDefault: "Purchase",
    ga4Default: "purchase",
  },
  {
    key: "converted",
    label: "Conversão / Lead gerado",
    metaDefault: "Lead",
    ga4Default: "generate_lead",
  },
] as const;

export type MktLifecycleKey = (typeof MKT_LIFECYCLE_SLOTS)[number]["key"];

export async function createMktWebhook(
  conn: IntegrationConnectionRow,
  input: {
    eventType: "WEBHOOK.CONVERTED" | "WEBHOOK.MARKED_OPPORTUNITY";
    url: string;
  }
): Promise<{ uuid: string } | null> {
  const { res, json } = await rdMktFetch(conn, "/integrations/webhooks", {
    method: "POST",
    body: JSON.stringify({
      event_type: input.eventType,
      entity_type: "CONTACT",
      url: input.url,
      http_method: "POST",
      include_relations: ["CONTACT_FUNNEL", "COMPANY"],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `MKT create webhook ${input.eventType} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`
    );
  }
  const rec =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  const uuid = rec?.uuid != null ? String(rec.uuid) : null;
  return uuid ? { uuid } : null;
}

export async function deleteMktWebhook(
  conn: IntegrationConnectionRow,
  uuid: string
): Promise<void> {
  await rdMktFetch(
    conn,
    `/integrations/webhooks/${encodeURIComponent(uuid)}`,
    { method: "DELETE" }
  );
}

/** Infer lifecycle slot from MKT webhook payload. */
export function inferMktLifecycle(
  eventType: string | null,
  payload: Record<string, unknown>
): MktLifecycleKey {
  const t = (eventType || "").toUpperCase();
  if (t.includes("MARKED_OPPORTUNITY") || t.includes("OPPORTUNITY")) {
    return "opportunity";
  }
  if (t.includes("CONVERTED") || t.includes("CONVERSION")) {
    return "converted";
  }

  const funnel =
    (payload.contact_funnel as Record<string, unknown> | undefined) ||
    (payload.funnel as Record<string, unknown> | undefined) ||
    null;
  const lifecycle =
    (typeof funnel?.lifecycle_stage === "string" && funnel.lifecycle_stage) ||
    (typeof payload.lifecycle_stage === "string" && payload.lifecycle_stage) ||
    (typeof payload.funnel_name === "string" && payload.funnel_name) ||
    "";
  const lower = lifecycle.toLowerCase();
  if (lower.includes("sale") || lower.includes("cliente") || lower.includes("won")) {
    return "sale";
  }
  if (lower.includes("opportunit") || lower.includes("oportunidade")) {
    return "opportunity";
  }
  if (lower.includes("qualif")) {
    return "qualified";
  }
  if (lower.includes("lead")) {
    return "lead";
  }
  return "converted";
}

export function extractMktContact(payload: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
  name: string | null;
  dealId: string | null;
} {
  const contact =
    (payload.contact &&
    typeof payload.contact === "object" &&
    !Array.isArray(payload.contact)
      ? (payload.contact as Record<string, unknown>)
      : null) ||
    (payload.leads &&
    Array.isArray(payload.leads) &&
    payload.leads[0] &&
    typeof payload.leads[0] === "object"
      ? (payload.leads[0] as Record<string, unknown>)
      : null) ||
    payload;

  const email =
    (typeof contact.email === "string" && contact.email) ||
    (typeof payload.email === "string" && payload.email) ||
    null;
  const phone =
    (typeof contact.personal_phone === "string" && contact.personal_phone) ||
    (typeof contact.mobile_phone === "string" && contact.mobile_phone) ||
    (typeof contact.phone === "string" && contact.phone) ||
    (typeof payload.phone === "string" && payload.phone) ||
    null;
  const name =
    (typeof contact.name === "string" && contact.name) ||
    ([contact.first_name, contact.last_name]
      .filter((x) => typeof x === "string")
      .join(" ")
      .trim() ||
      null);

  const dealId =
    (typeof payload.uuid === "string" && payload.uuid) ||
    (typeof contact.uuid === "string" && contact.uuid) ||
    (typeof contact.id === "string" && contact.id) ||
    (email ? `email:${email.toLowerCase()}` : null);

  return { email, phone, name, dealId };
}
