"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { AdsInsightsResult } from "@/lib/meta/ads-insights";

export function CampaignsView({
  accounts,
  trees,
}: {
  accounts: Array<{ id: string; label: string }>;
  trees: AdsInsightsResult[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("account") ?? "all";
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (selected === "all") return trees;
    return trees.filter((t) => t.accountId === selected);
  }, [trees, selected]);

  return (
    <div className="space-y-4">
      {accounts.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selected === "all" ? "default" : "outline"}
            onClick={() => router.push("/dashboard/campanhas?account=all")}
          >
            Todas as contas
          </Button>
          {accounts.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={selected === a.id ? "default" : "outline"}
              onClick={() =>
                router.push(`/dashboard/campanhas?account=${a.id}`)
              }
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}

      <form action="/dashboard/campanhas" method="get" className="inline">
        <input type="hidden" name="account" value={selected} />
        <input type="hidden" name="refresh" value="1" />
        <Button type="submit" variant="outline" size="sm">
          Atualizar insights (sob demanda)
        </Button>
      </form>

      {filtered.map((tree) => (
        <div key={tree.accountId} className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {tree.label} · fetch{" "}
            <span className="font-mono tabular-nums">
              {new Date(tree.fetchedAt).toLocaleString("pt-BR")}
            </span>
          </p>
          {tree.campaigns.map((c) => {
            const key = c.id;
            const isOpen = open[key];
            return (
              <div
                key={c.id}
                className="glass rounded-[var(--radius)] border p-3"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() =>
                    setOpen((s) => ({ ...s, [key]: !s[key] }))
                  }
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      spend {c.spend.toFixed(2)} · rev {c.revenue.toFixed(2)} ·
                      ROAS {c.roas.toFixed(2)} · CPA {c.cpa.toFixed(2)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen
                  ? c.adsets.map((as) => (
                      <div key={as.id} className="mt-3 border-l border-border pl-3">
                        <p className="text-sm font-medium">{as.name}</p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">
                          spend {as.spend.toFixed(2)} · ROAS {as.roas.toFixed(2)}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {as.ads.map((ad) => (
                            <li
                              key={ad.id}
                              className="text-xs text-muted-foreground"
                            >
                              {ad.name}{" "}
                              <span className="font-mono tabular-nums">
                                ({ad.spend.toFixed(2)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  : null}
              </div>
            );
          })}
          {!tree.campaigns.length ? (
            <p className="text-sm text-muted-foreground">
              Sem insights (configure token Ads ou force refresh).
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
