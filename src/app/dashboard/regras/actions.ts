"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { auditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { query } from "@/lib/db/pool";
import { safeActionMessage } from "@/lib/http/public-error";
import {
  trackingRuleSchema,
  type SnippetSettings,
} from "@/lib/tracking/snippet-config";
import {
  contextFromUrl,
  evaluateRules,
  type TrackingRule,
} from "@/lib/tracking/tracking-rules";

export type RulesActionResult =
  | { ok: true; preview?: ReturnType<typeof evaluateRules> }
  | { ok: false; error: string };

function parsePreserveParams(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function saveSnippetDiscoverySettings(
  formData: FormData
): Promise<RulesActionResult> {
  try {
    const actor = await requirePermission("settings:manage");
    const auto_ecommerce = formData.get("auto_ecommerce") === "on";
    const listen_datalayer = formData.get("listen_datalayer") === "on";
    const url_preserve_params = parsePreserveParams(
      String(formData.get("url_preserve_params") ?? "")
    );

    let rules: TrackingRule[] = [];
    const rulesJson = String(formData.get("rules_json") ?? "").trim();
    if (rulesJson) {
      const parsed = JSON.parse(rulesJson) as unknown;
      const checked = trackingRuleSchema.array().max(100).safeParse(parsed);
      if (!checked.success) {
        return { ok: false, error: "rules_invalid" };
      }
      rules = checked.data as TrackingRule[];
    }

    const settings: SnippetSettings = {
      rules,
      url_preserve_params,
      auto_ecommerce,
      listen_datalayer,
    };

    await query(
      `insert into settings (
         id, snippet_rules, url_preserve_params, auto_ecommerce, listen_datalayer
       ) values (1, $1::jsonb, $2::jsonb, $3, $4)
       on conflict (id) do update set
         snippet_rules = excluded.snippet_rules,
         url_preserve_params = excluded.url_preserve_params,
         auto_ecommerce = excluded.auto_ecommerce,
         listen_datalayer = excluded.listen_datalayer,
         updated_at = now()`,
      [
        JSON.stringify(settings.rules),
        JSON.stringify(settings.url_preserve_params),
        settings.auto_ecommerce,
        settings.listen_datalayer,
      ]
    );

    await auditLog({
      actorUserId: actor.id,
      action: "settings.snippet_discovery_update",
      resourceType: "settings",
      resourceId: "1",
      meta: {
        rules_count: settings.rules.length,
        auto_ecommerce: settings.auto_ecommerce,
        listen_datalayer: settings.listen_datalayer,
      },
    });

    revalidatePath("/dashboard/regras");
    revalidatePath("/dashboard/formularios");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}

async function addSimplePathRuleInner(
  formData: FormData
): Promise<RulesActionResult> {
  const actor = await requirePermission("settings:manage");
  const pathContains = String(formData.get("path_contains") ?? "").trim();
  const eventName = String(formData.get("event_name") ?? "").trim();
  const action = String(formData.get("action") ?? "force_event").trim() as
    | "force_event"
    | "exclude_pageview"
    | "exclude_lead"
    | "map_event_name";

  if (!pathContains) return { ok: false, error: "path_required" };
  if (
    (action === "force_event" || action === "map_event_name") &&
    !eventName
  ) {
    return { ok: false, error: "event_name_required" };
  }

  const row = await query<{
    snippet_rules: TrackingRule[] | null;
  }>(`select snippet_rules from settings where id = 1 limit 1`);
  const existing = (row.rows[0]?.snippet_rules as TrackingRule[]) || [];

  const rule: TrackingRule = {
    id: randomUUID().slice(0, 8),
    name: `${action}: ${pathContains}`,
    enabled: true,
    match: "and",
    conditions: [{ field: "path", op: "contains", value: pathContains }],
    action,
    event_name: eventName || undefined,
  };

  const rules = [...existing, rule];
  await query(
    `insert into settings (id, snippet_rules)
     values (1, $1::jsonb)
     on conflict (id) do update set
       snippet_rules = excluded.snippet_rules,
       updated_at = now()`,
    [JSON.stringify(rules)]
  );

  await auditLog({
    actorUserId: actor.id,
    action: "settings.snippet_rule_add",
    resourceType: "settings",
    resourceId: "1",
    meta: { rule_id: rule.id, pathContains, eventName, action },
  });

  revalidatePath("/dashboard/regras");
  revalidatePath("/dashboard/formularios");
  return { ok: true };
}

export async function addSimplePathRule(
  formData: FormData
): Promise<RulesActionResult> {
  try {
    return await addSimplePathRuleInner(formData);
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}

/** Form-action wrapper (void) for server components / native forms. */
export async function acceptSuggestedRule(formData: FormData): Promise<void> {
  const res = await addSimplePathRule(formData);
  if (!res.ok) throw new Error(res.error);
}

export async function deleteSnippetRule(
  formData: FormData
): Promise<RulesActionResult> {
  try {
    const actor = await requirePermission("settings:manage");
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing_id" };

    const row = await query<{ snippet_rules: TrackingRule[] | null }>(
      `select snippet_rules from settings where id = 1 limit 1`
    );
    const existing = (row.rows[0]?.snippet_rules as TrackingRule[]) || [];
    const rules = existing.filter((r) => r.id !== id);

    await query(
      `update settings set snippet_rules = $1::jsonb, updated_at = now() where id = 1`,
      [JSON.stringify(rules)]
    );

    await auditLog({
      actorUserId: actor.id,
      action: "settings.snippet_rule_delete",
      resourceType: "settings",
      resourceId: "1",
      meta: { rule_id: id },
    });

    revalidatePath("/dashboard/regras");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}

export async function previewRuleUrl(
  formData: FormData
): Promise<RulesActionResult> {
  try {
    await requirePermission("settings:manage");
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { ok: false, error: "url_required" };

    const row = await query<{ snippet_rules: TrackingRule[] | null }>(
      `select snippet_rules from settings where id = 1 limit 1`
    );
    const rules = (row.rows[0]?.snippet_rules as TrackingRule[]) || [];
    const preview = evaluateRules(rules, contextFromUrl(url));
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }
}
