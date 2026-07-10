import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";

function isRefund(status: string | null) {
  if (!status) return false;
  return /refund|reembolso|chargedback|chargeback/i.test(status);
}

export default async function FaturamentoPage() {
  let error: string | null = null;
  let rows: Array<{
    id: string;
    transaction_id: string;
    value: number | null;
    currency: string | null;
    status: string | null;
    product_name: string | null;
    match_reason: string | null;
    created_at: string;
  }> = [];
  let revenue = 0;
  let refunds = 0;
  let ticket = 0;

  try {
    await ensureDbReady();
    const result = await query<{
      id: string;
      transaction_id: string;
      value: number | null;
      currency: string | null;
      status: string | null;
      product_name: string | null;
      match_reason: string | null;
      created_at: string;
    }>(
      `select id, transaction_id, value, currency, status, product_name,
              match_reason, created_at
       from purchases
       order by created_at desc
       limit 200`
    );
    rows = result.rows;
    const paid = rows.filter((r) => !isRefund(r.status));
    const refunded = rows.filter((r) => isRefund(r.status));
    revenue = paid.reduce((s, r) => s + Number(r.value ?? 0), 0);
    refunds = refunded.reduce((s, r) => s + Number(r.value ?? 0), 0);
    ticket = paid.length ? revenue / paid.length : 0;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro";
  }

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Receita, ticket médio e reembolsos
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { t: "Receita", v: fmt(revenue) },
          { t: "Ticket médio", v: fmt(ticket) },
          { t: "Reembolsos", v: fmt(refunds) },
        ].map((c) => (
          <Card key={c.t} className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{c.t}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl tabular-nums">{c.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Compras</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Transação</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.transaction_id}
                  </TableCell>
                  <TableCell>{r.product_name ?? "—"}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {Number(r.value ?? 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: r.currency || "BRL",
                    })}
                  </TableCell>
                  <TableCell>{r.status ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.match_reason ?? "—"}</TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Sem compras
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
