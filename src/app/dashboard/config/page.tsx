import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { SettingsRow } from "@/lib/db/types";
import { SettingsForm } from "./config-forms";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  let settings = {
    webhook_token: "",
    currency: "BRL",
    test_event_code: "",
  };
  let loadError: string | null = null;

  try {
    await ensureDbReady();
    const s = await queryOne<SettingsRow>(
      `select * from settings where id = 1 limit 1`
    );
    if (s) {
      settings = {
        webhook_token: s.webhook_token ?? "",
        currency: s.currency,
        test_event_code: s.test_event_code ?? "",
      };
    }
  } catch (e) {
    loadError =
      e instanceof Error
        ? e.message
        : "Falha ao carregar (verifique DATABASE_URL e migrations)";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração</h1>
        <p className="text-sm text-muted-foreground">
          Settings globais da stack. Pixels, GA4, Hotmart e CRMs ficam em{" "}
          <Link href="/dashboard/integracoes" className="text-primary underline">
            Integrações
          </Link>
          .
        </p>
      </div>

      {loadError ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Settings globais</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            webhookToken={settings.webhook_token}
            currency={settings.currency}
            testEventCode={settings.test_event_code}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Webhook token legado: /api/webhook/compra. Preferir webhook por
            conexão em Integrações (/api/webhook/in/&#123;id&#125;).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
