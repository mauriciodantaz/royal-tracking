import Link from "next/link";

import { updateFormLabel } from "@/app/dashboard/integracoes/actions";
import { acceptSuggestedRule } from "@/app/dashboard/regras/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { FormRow } from "@/lib/db/types";
import { formSamplePageUrl } from "@/lib/tracking/form-fingerprint";

export const dynamic = "force-dynamic";

type Suggestion = {
  path_hint: string;
  hits: number;
  suggested_event: string;
};

function classificationList(raw: unknown): Array<{ kind: string; key: string }> {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, { key?: string }>).map(
    ([kind, meta]) => ({
      kind,
      key: String(meta?.key || ""),
    })
  );
}

function suggestEventForPath(path: string): string | null {
  const p = path.toLowerCase();
  if (p.includes("checkout") || p.includes("finalizar")) return "begin_checkout";
  if (p.includes("carrinho") || p.includes("/cart")) return "view_cart";
  if (
    p.includes("obrigado") ||
    p.includes("thank") ||
    p.includes("order-received")
  ) {
    return "purchase";
  }
  if (p.includes("produto") || p.includes("/product")) return "view_item";
  if (p.includes("busca") || p.includes("search")) return "search";
  return null;
}

export default async function FormulariosPage() {
  let forms: FormRow[] = [];
  let suggestions: Suggestion[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<FormRow>(
      `select * from forms order by submission_count desc, updated_at desc`
    );
    forms = result.rows;

    const pathRows = await query<{ path: string; hits: string }>(
      `select
         regexp_replace(coalesce(canonical_url, ''), '^https?://[^/]+', '') as path,
         count(*)::text as hits
       from events_log
       where created_at > now() - interval '30 days'
         and canonical_url is not null
       group by 1
       having count(*) >= 3
       order by count(*) desc
       limit 40`
    );

    const seen = new Set<string>();
    for (const row of pathRows.rows) {
      const path = row.path || "/";
      const event = suggestEventForPath(path);
      if (!event) continue;
      const key = `${event}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        path_hint: path.split("?")[0] || path,
        hits: Number(row.hits) || 0,
        suggested_event: event,
      });
      if (suggestions.length >= 8) break;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar formulários";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formulários</h1>
        <p className="text-sm text-muted-foreground">
          Formulários descobertos pelo snippet com classificação automática de
          campos.{" "}
          <Link href="/dashboard/regras" className="underline">
            Regras do snippet
          </Link>
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <>
          {suggestions.length > 0 ? (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">
                  Sugestões de eventos (últimos 30 dias)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Baseado em URLs canônicas frequentes. Aceitar cria uma regra
                  force_event — o snippet só dispara após você confirmar.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestions.map((s) => (
                  <div
                    key={`${s.suggested_event}-${s.path_hint}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        Detectamos <code>{s.path_hint}</code> ({s.hits}x)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Criar evento <code>{s.suggested_event}</code>?
                      </p>
                    </div>
                    <form action={acceptSuggestedRule}>
                      <input
                        type="hidden"
                        name="path_contains"
                        value={s.path_hint}
                      />
                      <input
                        type="hidden"
                        name="event_name"
                        value={s.suggested_event}
                      />
                      <input type="hidden" name="action" value="force_event" />
                      <Button type="submit" size="sm">
                        Aceitar
                      </Button>
                    </form>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {forms.map((f) => {
              const classified = classificationList(f.field_classification);
              const fieldNames = Array.isArray(f.field_names)
                ? (f.field_names as string[])
                : [];
              return (
                <Card key={f.id} className="glass">
                  <CardHeader>
                    <CardTitle className="text-base">{f.label}</CardTitle>
                    <p className="font-mono text-xs text-muted-foreground">
                      {f.fingerprint} · {f.submission_count} envios
                    </p>
                  </CardHeader>
                  <CardContent>
                    <form
                      action={updateFormLabel}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={f.id} />
                      <Input
                        name="label"
                        defaultValue={f.label}
                        className="max-w-xs"
                      />
                      <Input
                        name="default_event_name"
                        defaultValue={f.default_event_name}
                        className="max-w-[140px]"
                        placeholder="Lead"
                      />
                      <Button type="submit" size="sm">
                        Salvar
                      </Button>
                    </form>

                    {classified.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs">
                        {classified.map((c) => (
                          <li key={c.kind}>
                            ✔ {c.kind}
                            {c.key ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ← {c.key}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : fieldNames.length > 0 ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Campos: {fieldNames.slice(0, 8).join(", ")}
                        {fieldNames.length > 8 ? "…" : ""}
                      </p>
                    ) : null}

                    {f.page_url ? (
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {formSamplePageUrl(f.page_url) ?? f.page_url}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
            {forms.length === 0 ? (
              <Card className="glass md:col-span-2">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Nenhum formulário capturado ainda.
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
