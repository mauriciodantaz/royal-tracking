"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  createTrackedLinkAction,
  deleteTrackedLinkAction,
  toggleTrackedLinkAction,
} from "@/app/dashboard/links/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TrackedLinkRow } from "@/lib/tracking/tracked-links";

export function LinksClient({
  links,
  baseUrl,
  error,
}: {
  links: TrackedLinkRow[];
  baseUrl: string;
  error: string | null;
}) {
  const [pending, start] = useTransition();

  function publicUrl(slug: string) {
    const root = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    return `${root}/r/${slug}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Links rastreados</h1>
        <p className="text-sm text-muted-foreground">
          URLs first-party <code className="text-xs">/r/&#123;slug&#125;</code> que
          capturam visitor + ticket e abrem o WhatsApp. Use em bio, QR, e-mail ou
          anúncios Click-to-WhatsApp (quando o fluxo passar pelo site/redirect).
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Novo link</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              start(async () => {
                try {
                  const r = await createTrackedLinkAction(fd);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(`Link /r/${r.slug} criado`);
                  form.reset();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Falha ao criar link"
                  );
                }
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="label">Nome</Label>
              <Input id="label" name="label" placeholder="Campanha Meta julho" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug (opcional)</Label>
              <Input id="slug" name="slug" placeholder="meta-julho" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone WhatsApp</Label>
              <Input
                id="phone"
                name="phone"
                required
                placeholder="5511999999999"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="message">Mensagem pré-preenchida</Label>
              <textarea
                id="message"
                name="message"
                rows={3}
                placeholder="Olá! Vim pelo anúncio e quero saber mais."
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              />
              <p className="text-[11px] text-muted-foreground">
                O redirect adiciona automaticamente <code>[rt:código]</code> no
                final.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="utm_source">utm_source</Label>
              <Input id="utm_source" name="utm_source" placeholder="meta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="utm_medium">utm_medium</Label>
              <Input id="utm_medium" name="utm_medium" placeholder="cpc" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="utm_campaign">utm_campaign</Label>
              <Input id="utm_campaign" name="utm_campaign" placeholder="julho" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="utm_content">utm_content</Label>
              <Input id="utm_content" name="utm_content" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                Criar link
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">{links.length} links</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3">Slug</th>
                <th className="py-2 pr-3">URL</th>
                <th className="py-2 pr-3">Telefone</th>
                <th className="py-2 pr-3">Cliques</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-b border-border/40 align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{l.slug}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="font-mono text-[11px] text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                      onClick={() => {
                        void navigator.clipboard.writeText(publicUrl(l.slug));
                        toast.success("URL copiada");
                      }}
                    >
                      {publicUrl(l.slug)}
                    </button>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{l.phone_digits}</td>
                  <td className="py-2 pr-3 text-xs">{l.click_count}</td>
                  <td className="py-2 pr-3 text-xs">
                    {l.active ? "ativo" : "inativo"}
                  </td>
                  <td className="py-2 space-x-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", l.id);
                        start(async () => {
                          const r = await toggleTrackedLinkAction(fd);
                          if (!r.ok) toast.error(r.error);
                        });
                      }}
                    >
                      {l.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Apagar /r/${l.slug}?`)) return;
                        const fd = new FormData();
                        fd.set("id", l.id);
                        start(async () => {
                          const r = await deleteTrackedLinkAction(fd);
                          if (!r.ok) toast.error(r.error);
                          else toast.success("Removido");
                        });
                      }}
                    >
                      Apagar
                    </Button>
                  </td>
                </tr>
              ))}
              {links.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nenhum link ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
