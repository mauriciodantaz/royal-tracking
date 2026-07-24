import { z } from "zod";

import { queryOne } from "@/lib/db/pool";
import type { TrackingRule } from "./tracking-rules";

const conditionSchema = z.object({
  field: z.enum([
    "url",
    "hostname",
    "path",
    "query",
    "hash",
    "title",
    "referrer",
  ]),
  op: z.enum([
    "equals",
    "contains",
    "starts_with",
    "ends_with",
    "regex",
    "not_equals",
    "not_contains",
    "exists",
  ]),
  value: z.string().max(500).optional(),
});

export const trackingRuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120).optional(),
  enabled: z.boolean().optional(),
  match: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema).min(1).max(20),
  action: z.enum([
    "exclude_pageview",
    "exclude_lead",
    "force_event",
    "map_event_name",
  ]),
  event_name: z.string().min(1).max(64).optional(),
});

export const snippetSettingsSchema = z.object({
  rules: z.array(trackingRuleSchema).max(100).default([]),
  url_preserve_params: z.array(z.string().max(64)).max(50).default([]),
  auto_ecommerce: z.boolean().default(false),
  listen_datalayer: z.boolean().default(false),
});

export type SnippetSettings = z.infer<typeof snippetSettingsSchema>;

export const DEFAULT_SNIPPET_SETTINGS: SnippetSettings = {
  rules: [],
  url_preserve_params: [],
  auto_ecommerce: false,
  listen_datalayer: false,
};

type SettingsRow = {
  snippet_rules: unknown;
  url_preserve_params: unknown;
  auto_ecommerce: boolean | null;
  listen_datalayer: boolean | null;
};

export async function loadSnippetSettings(): Promise<SnippetSettings> {
  const row = await queryOne<SettingsRow>(
    `select snippet_rules, url_preserve_params, auto_ecommerce, listen_datalayer
     from settings where id = 1 limit 1`
  );
  if (!row) return { ...DEFAULT_SNIPPET_SETTINGS };

  const parsed = snippetSettingsSchema.safeParse({
    rules: row.snippet_rules ?? [],
    url_preserve_params: row.url_preserve_params ?? [],
    auto_ecommerce: row.auto_ecommerce ?? false,
    listen_datalayer: row.listen_datalayer ?? false,
  });
  if (!parsed.success) return { ...DEFAULT_SNIPPET_SETTINGS };
  return parsed.data;
}

/** Public payload for /api/tracking/config (no secrets). */
export function publicSnippetConfig(
  settings: SnippetSettings,
  ticketPrefix: string
): {
  ticket_prefix: string;
  rules: TrackingRule[];
  url_preserve_params: string[];
  auto_ecommerce: boolean;
  listen_datalayer: boolean;
} {
  return {
    ticket_prefix: ticketPrefix,
    rules: settings.rules as TrackingRule[],
    url_preserve_params: settings.url_preserve_params,
    auto_ecommerce: settings.auto_ecommerce,
    listen_datalayer: settings.listen_datalayer,
  };
}
