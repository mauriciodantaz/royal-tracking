import { updateFormLabel } from "@/app/dashboard/integracoes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { FormRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function FormulariosPage() {
  let forms: FormRow[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<FormRow>(
      `select * from forms order by submission_count desc, updated_at desc`
    );
    forms = result.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar formulários";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formulários</h1>
        <p className="text-sm text-muted-foreground">
          Formulários descobertos pelo snippet (fingerprint automático).
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {forms.map((f) => (
            <Card key={f.id} className="glass">
              <CardHeader>
                <CardTitle className="text-base">{f.label}</CardTitle>
                <p className="font-mono text-xs text-muted-foreground">
                  {f.fingerprint} · {f.submission_count} envios
                </p>
              </CardHeader>
              <CardContent>
                <form action={updateFormLabel} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={f.id} />
                  <Input name="label" defaultValue={f.label} className="max-w-xs" />
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
                {f.page_url ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">{f.page_url}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {forms.length === 0 ? (
            <Card className="glass md:col-span-2">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Nenhum formulário capturado ainda.
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
