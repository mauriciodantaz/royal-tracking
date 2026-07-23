import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { FormLeadRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

function attributionBadge(lead: FormLeadRow): {
  label: string;
  className: string;
} {
  const reason = lead.match_reason ?? "";
  const fields =
    lead.fields && typeof lead.fields === "object" && !Array.isArray(lead.fields)
      ? (lead.fields as Record<string, unknown>)
      : null;
  const hasTicket = Boolean(fields?.ticket_value) || reason.includes("ticket");

  if (lead.ctwa_clid || reason.includes("ctwa")) {
    return {
      label: "ctwa",
      className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    };
  }
  if (hasTicket) {
    return {
      label: "ticket",
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (reason.includes("phone_hash") || reason === "phone") {
    return {
      label: "phone",
      className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    };
  }
  if (
    reason.includes("wa_no_ticket_organic") ||
    reason.includes("organic")
  ) {
    return {
      label: "organic",
      className: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
    };
  }
  if (
    lead.match_status === "unmatched" ||
    reason.includes("unmatched") ||
    reason.includes("no_visitor")
  ) {
    return {
      label: "unmatched",
      className: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    };
  }
  if (lead.source_provider === "snippet") {
    return {
      label: "form",
      className: "bg-muted text-muted-foreground",
    };
  }
  return {
    label: lead.match_status ?? "—",
    className: "bg-muted text-muted-foreground",
  };
}

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
                  <th className="py-2 pr-3">Atribuição</th>
                  <th className="py-2 pr-3">UTM</th>
                  <th className="py-2">trck_user_id</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const badge = attributionBadge(l);
                  return (
                  <tr key={l.id} className="border-b border-border/40 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{l.email ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{l.phone ?? "—"}</td>
                    <td className="py-2 pr-3">{l.name ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{l.source_provider}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                      {[l.utm_source, l.utm_medium, l.utm_campaign]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-muted-foreground">
                      {l.trck_user_id ?? "—"}
                    </td>
                  </tr>
                  );
                })}
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
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
