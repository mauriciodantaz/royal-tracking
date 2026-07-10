import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type {
  Ga4AccountRow,
  MetaAdAccountRow,
  MetaPixelRow,
  SettingsRow,
} from "@/lib/db/types";
import {
  Ga4AccountForm,
  MetaAdAccountForm,
  MetaPixelForm,
  SettingsForm,
} from "./config-forms";

export default async function ConfigPage() {
  let settings = {
    webhook_token: "",
    currency: "BRL",
    test_event_code: "",
  };
  let ga4: Array<{
    id: string;
    label: string;
    measurement_id: string;
    active: boolean;
    hasSecret: boolean;
  }> = [];
  let pixels: Array<{
    id: string;
    label: string;
    pixel_id: string;
    active: boolean;
    hasSecret: boolean;
  }> = [];
  let ads: Array<{
    id: string;
    label: string;
    ad_account_id: string;
    active: boolean;
    hasSecret: boolean;
  }> = [];
  let loadError: string | null = null;

  try {
    await ensureDbReady();
    const [s, g, p, a] = await Promise.all([
      queryOne<SettingsRow>(`select * from settings where id = 1 limit 1`),
      query<Ga4AccountRow>(`select * from ga4_accounts order by created_at`),
      query<MetaPixelRow>(`select * from meta_pixels order by created_at`),
      query<MetaAdAccountRow>(
        `select * from meta_ad_accounts order by created_at`
      ),
    ]);
    if (s) {
      settings = {
        webhook_token: s.webhook_token ?? "",
        currency: s.currency ?? "BRL",
        test_event_code: s.test_event_code ?? "",
      };
    }
    ga4 = g.rows.map((row) => ({
      id: row.id,
      label: row.label,
      measurement_id: row.measurement_id,
      active: row.active,
      hasSecret: Boolean(row.api_secret_cipher),
    }));
    pixels = p.rows.map((row) => ({
      id: row.id,
      label: row.label,
      pixel_id: row.pixel_id,
      active: row.active,
      hasSecret: Boolean(row.capi_token_cipher),
    }));
    ads = a.rows.map((row) => ({
      id: row.id,
      label: row.label,
      ad_account_id: row.ad_account_id,
      active: row.active,
      hasSecret: Boolean(row.ads_token_cipher),
    }));
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
          Credenciais multi-conta no banco (cifadas). Secrets de infra só no
          env da stack (DATABASE_URL, ENCRYPTION_KEY, AUTH_SECRET).
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
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">GA4 accounts</h2>
        {ga4.map((a) => (
          <Ga4AccountForm key={a.id} account={a} />
        ))}
        <Ga4AccountForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Meta pixels</h2>
        {pixels.map((p) => (
          <MetaPixelForm key={p.id} pixel={p} />
        ))}
        <MetaPixelForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Meta ad accounts</h2>
        {ads.map((a) => (
          <MetaAdAccountForm key={a.id} account={a} />
        ))}
        <MetaAdAccountForm />
      </section>
    </div>
  );
}
