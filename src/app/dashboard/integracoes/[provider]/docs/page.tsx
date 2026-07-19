import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DocsMarkdown } from "@/components/integrations/docs-markdown";
import { Button } from "@/components/ui/button";
import { loadIntegrationDocsMarkdown } from "@/lib/integrations/docs";
import { isUiVisibleProvider } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export default async function IntegrationDocsPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  if (!isUiVisibleProvider(provider)) notFound();

  const doc = await loadIntegrationDocsMarkdown(provider);
  if (!doc) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href={`/dashboard/integracoes/${provider}`} />}
        >
          <ArrowLeft className="size-3.5" />
          Voltar para {doc.title}
        </Button>
        <p className="text-xs text-muted-foreground">
          Documentação de credenciais · {doc.slug}
        </p>
      </div>
      <DocsMarkdown markdown={doc.markdown} />
    </div>
  );
}
