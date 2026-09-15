"use server";

import { revalidatePath } from "next/cache";

import { auditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { safeActionMessage } from "@/lib/http/public-error";
import {
  deleteCustomEvent,
  upsertCustomEvent,
} from "@/lib/tracking/custom-events";
import { sanitizeEventParams } from "@/lib/tracking/event-params";

export type CustomEventActionResult =
  | { ok: true }
  | { ok: false; error: string };

function parseParams(raw: string) {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return sanitizeEventParams(out);
}

function parseAliases(raw: string) {
  const aliases: Array<{ source_provider?: string | null; received_name: string }> =
    [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon > 0 && !trimmed.includes(" ")) {
      const provider = trimmed.slice(0, colon).trim();
      const name = trimmed.slice(colon + 1).trim();
      if (provider && name) {
        aliases.push({ source_provider: provider, received_name: name });
        continue;
      }
    }
    aliases.push({ received_name: trimmed });
  }
  return aliases;
}

export async function saveCustomEventAction(
  formData: FormData
): Promise<CustomEventActionResult> {
  try {
    const actor = await requirePermission("settings:manage");
    const id = String(formData.get("id") ?? "").trim() || undefined;
    await upsertCustomEvent(
      {
        slug: String(formData.get("slug") ?? ""),
        label: String(formData.get("label") ?? ""),
        meta_event_name: String(formData.get("meta_event_name") ?? "") || null,
        ga4_event_name: String(formData.get("ga4_event_name") ?? "") || null,
        meta_enabled: formData.get("meta_enabled") === "on",
        ga4_enabled: formData.get("ga4_enabled") === "on",
        include_value: formData.get("include_value") === "on",
        include_items: formData.get("include_items") === "on",
        default_currency: String(formData.get("default_currency") ?? "") || null,
        default_params: parseParams(String(formData.get("default_params") ?? "")),
        active: formData.get("active") !== "off",
        aliases: parseAliases(String(formData.get("aliases") ?? "")),
      },
      id
    );
    await auditLog({
      actorUserId: actor.id,
      action: id ? "custom_event.update" : "custom_event.create",
      resourceType: "custom_event",
      resourceId: id ?? null,
    });
    revalidatePath("/dashboard/eventos");
    revalidatePath("/dashboard/integracoes");
    return { ok: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "invalid_custom_event_slug") {
      return {
        ok: false,
        error:
          "Slug inválido. Use letras minúsculas, números e _ (sem nomes nativos como lead ou purchase).",
      };
    }
    if (code === "invalid_custom_event_label") {
      return { ok: false, error: "Informe um nome interno." };
    }
    if (code.includes("custom_events_slug") || code.includes("duplicate")) {
      return { ok: false, error: "Já existe um evento com este slug." };
    }
    return { ok: false, error: safeActionMessage(e, "Não foi possível salvar") };
  }
}

export async function deleteCustomEventAction(
  id: string
): Promise<CustomEventActionResult> {
  try {
    const actor = await requirePermission("settings:manage");
    await deleteCustomEvent(id);
    await auditLog({
      actorUserId: actor.id,
      action: "custom_event.delete",
      resourceType: "custom_event",
      resourceId: id,
    });
    revalidatePath("/dashboard/eventos");
    revalidatePath("/dashboard/integracoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: safeActionMessage(e, "Não foi possível excluir") };
  }
}
