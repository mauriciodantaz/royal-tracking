import { INTEGRATION_MODULES, getModule } from "@/lib/integrations/registry";

const LEGACY_LABELS: Record<string, string> = {
  snippet: "Snippet",
  webhook: "Webhook",
  api: "API",
};

/** Human-readable origin for events_log.ingest_path (platform or legacy channel). */
export function ingestPathLabel(ingest: string | null | undefined): string {
  const v = ingest?.trim() ?? "";
  if (!v) return "—";
  if (v in LEGACY_LABELS) return LEGACY_LABELS[v]!;
  return getModule(v)?.name ?? v;
}

/** Slugs whose label or id matches a search term (for server-side origem filter). */
export function ingestPathsMatchingSearch(term: string): string[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const [slug, label] of Object.entries(LEGACY_LABELS)) {
    if (slug.includes(q) || label.toLowerCase().includes(q)) out.push(slug);
  }
  for (const mod of INTEGRATION_MODULES) {
    if (
      mod.provider.includes(q) ||
      mod.name.toLowerCase().includes(q)
    ) {
      out.push(mod.provider);
    }
  }
  return [...new Set(out)];
}
