import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const admin = createAdminClient();
    const [s, g, p, a] = await Promise.all([
      admin.from("settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("ga4_accounts").select("*").order("created_at"),
      admin.from("meta_pixels").select("*").order("created_at"),
      admin.from("meta_ad_accounts").select("*").order("created_at"),
    ]);
    if (s.data) {
      settings = {
        webhook_token: s.data.webhook_token ?? "",
        currency: s.data.currency ?? "BRL",
        test_event_code: s.data.test_event_code ?? "",
      };
    }
    ga4 = (g.data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      measurement_id: row.measurement_id,
      active: row.active,
      hasSecret: Boolean(row.api_secret_cipher),
    }));
    pixels = (p.data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      pixel_id: row.pixel_id,
      active: row.active,
      hasSecret: Boolean(row.capi_token_cipher),
    }));
    ads = (a.data ?? []).map((row) => ({
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
        : "Falha ao carregar (verifique SERVICE_ROLE_KEY e migration)";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração</h1>
        <p className="text-sm text-muted-foreground">
          Credenciais multi-conta no banco (cifadas). Nada sensível em env além
          da infra Supabase.
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
