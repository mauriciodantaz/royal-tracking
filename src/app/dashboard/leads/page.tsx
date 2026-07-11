import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { FormLeadRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  let leads: FormLeadRow[] = [];
  let error: string | null = null;

  try {
    await ensureDbReady();
    const result = await query<FormLeadRow>(
      `select * from form_leads order by created_at desc limit 200`
    );
    leads = result.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar leads";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Submissões de formulários e leads inbound (últimos 200).
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">{leads.length} leads</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Telefone</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Fonte</th>
                  <th className="py-2 pr-3">UTM</th>
                  <th className="py-2">trck_user_id</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-border/40 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{l.email ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{l.phone ?? "—"}</td>
                    <td className="py-2 pr-3">{l.name ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{l.source_provider}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                      {[l.utm_source, l.utm_medium, l.utm_campaign]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-muted-foreground">
                      {l.trck_user_id ?? "—"}
                    </td>
                  </tr>
                ))}
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum lead ainda. Envie um formulário com o snippet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
