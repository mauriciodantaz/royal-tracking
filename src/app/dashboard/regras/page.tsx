import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import {
  DEFAULT_SNIPPET_SETTINGS,
  type SnippetSettings,
} from "@/lib/tracking/snippet-config";
import type { TrackingRule } from "@/lib/tracking/tracking-rules";

import { RegrasClient } from "./regras-client";

export const dynamic = "force-dynamic";

export default async function RegrasPage() {
  let settings: SnippetSettings = { ...DEFAULT_SNIPPET_SETTINGS };
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<{
      snippet_rules: TrackingRule[] | null;
      url_preserve_params: string[] | null;
      auto_ecommerce: boolean | null;
      listen_datalayer: boolean | null;
    }>(
      `select snippet_rules, url_preserve_params, auto_ecommerce, listen_datalayer
       from settings where id = 1 limit 1`
    );
    const row = result.rows[0];
    if (row) {
      settings = {
        rules: (row.snippet_rules as TrackingRule[]) || [],
        url_preserve_params: (row.url_preserve_params as string[]) || [],
        auto_ecommerce: !!row.auto_ecommerce,
        listen_datalayer: !!row.listen_datalayer,
      };
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar regras";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Regras do site
        </h1>
        <p className="text-sm text-muted-foreground">
          O snippet já captura PageView e Lead sozinho. Use esta página só para
          ajustar exceções ou eventos extras.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <RegrasClient settings={settings} />
      )}
    </div>
  );
}
