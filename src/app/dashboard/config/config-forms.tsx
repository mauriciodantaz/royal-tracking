"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteGa4Account,
  deleteMetaAdAccount,
  deleteMetaPixel,
  testGa4Account,
  testMetaAdAccount,
  testMetaPixel,
  updateSettings,
  upsertGa4Account,
  upsertMetaAdAccount,
  upsertMetaPixel,
} from "./actions";

function SecretHint({ hasSecret }: { hasSecret: boolean }) {
  return (
    <p className="text-xs text-muted-foreground">
      {hasSecret
        ? "Segredo já salvo (mascarado). Preencha só para substituir."
        : "Obrigatório ao criar."}
    </p>
  );
}

export function SettingsForm({
  webhookToken,
  currency,
  testEventCode,
}: {
  webhookToken: string;
  currency: string;
  testEventCode: string;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={(fd) => {
        start(async () => {
          try {
            await updateSettings(fd);
            toast.success("Settings salvos");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="webhook_token">Webhook token</Label>
        <Input
          id="webhook_token"
          name="webhook_token"
          defaultValue={webhookToken}
          className="font-mono"
          placeholder="token secreto do /api/webhook/compra"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Moeda padrão</Label>
        <Input id="currency" name="currency" defaultValue={currency} maxLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="test_event_code">Meta test_event_code</Label>
        <Input
          id="test_event_code"
          name="test_event_code"
          defaultValue={testEventCode}
          className="font-mono"
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Salvar settings
        </Button>
      </div>
    </form>
  );
}

export function Ga4AccountForm({
  account,
}: {
  account?: {
    id: string;
    label: string;
    measurement_id: string;
    active: boolean;
    hasSecret: boolean;
  };
}) {
  const [pending, start] = useTransition();
  const isEdit = Boolean(account);

  return (
    <form
      className="glass space-y-3 rounded-[var(--radius)] border p-4"
      action={(fd) => {
        start(async () => {
          try {
            await upsertGa4Account(fd);
            toast.success(isEdit ? "GA4 atualizado" : "GA4 adicionado");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input name="label" required defaultValue={account?.label} />
        </div>
        <div className="space-y-2">
          <Label>Measurement ID</Label>
          <Input
            name="measurement_id"
            required
            className="font-mono"
            defaultValue={account?.measurement_id}
            placeholder="G-XXXXXXXX"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>API Secret</Label>
          <Input
            name="api_secret"
            className="font-mono"
            placeholder={account?.hasSecret ? "••••••••" : "api_secret"}
          />
          <SecretHint hasSecret={Boolean(account?.hasSecret)} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={account?.active ?? true}
            className="size-4"
          />
          Ativo
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {isEdit ? "Salvar" : "Adicionar"}
        </Button>
        {account ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const r = await testGa4Account(account.id);
                  if (r.ok) toast.success("Conexão GA4 OK");
                  else toast.error(JSON.stringify(r));
                });
              }}
            >
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  await deleteGa4Account(account.id);
                  toast.success("Removido");
                });
              }}
            >
              Remover
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

export function MetaPixelForm({
  pixel,
}: {
  pixel?: {
    id: string;
    label: string;
    pixel_id: string;
    active: boolean;
    hasSecret: boolean;
  };
}) {
  const [pending, start] = useTransition();
  const isEdit = Boolean(pixel);

  return (
    <form
      className="glass space-y-3 rounded-[var(--radius)] border p-4"
      action={(fd) => {
        start(async () => {
          try {
            await upsertMetaPixel(fd);
            toast.success(isEdit ? "Pixel atualizado" : "Pixel adicionado");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      {pixel ? <input type="hidden" name="id" value={pixel.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input name="label" required defaultValue={pixel?.label} />
        </div>
        <div className="space-y-2">
          <Label>Pixel ID</Label>
          <Input
            name="pixel_id"
            required
            className="font-mono"
            defaultValue={pixel?.pixel_id}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>CAPI token</Label>
          <Input
            name="capi_token"
            className="font-mono"
            placeholder={pixel?.hasSecret ? "••••••••" : "access token"}
          />
          <SecretHint hasSecret={Boolean(pixel?.hasSecret)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={pixel?.active ?? true} />
          Ativo
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {isEdit ? "Salvar" : "Adicionar"}
        </Button>
        {pixel ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const r = await testMetaPixel(pixel.id);
                  if (r.ok) toast.success("Conexão Meta OK");
                  else toast.error(JSON.stringify(r));
                });
              }}
            >
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  await deleteMetaPixel(pixel.id);
                  toast.success("Removido");
                });
              }}
            >
              Remover
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

export function MetaAdAccountForm({
  account,
}: {
  account?: {
    id: string;
    label: string;
    ad_account_id: string;
    active: boolean;
    hasSecret: boolean;
  };
}) {
  const [pending, start] = useTransition();
  const isEdit = Boolean(account);

  return (
    <form
      className="glass space-y-3 rounded-[var(--radius)] border p-4"
      action={(fd) => {
        start(async () => {
          try {
            await upsertMetaAdAccount(fd);
            toast.success(isEdit ? "Conta Ads atualizada" : "Conta Ads adicionada");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input name="label" required defaultValue={account?.label} />
        </div>
        <div className="space-y-2">
          <Label>Ad Account ID</Label>
          <Input
            name="ad_account_id"
            required
            className="font-mono"
            defaultValue={account?.ad_account_id}
            placeholder="act_123 ou 123"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Ads token</Label>
          <Input
            name="ads_token"
            className="font-mono"
            placeholder={account?.hasSecret ? "••••••••" : "access token"}
          />
          <SecretHint hasSecret={Boolean(account?.hasSecret)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={account?.active ?? true}
          />
          Ativo
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {isEdit ? "Salvar" : "Adicionar"}
        </Button>
        {account ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const r = await testMetaAdAccount(account.id);
                  if (r.ok) toast.success("Conexão Ads OK");
                  else toast.error(JSON.stringify(r));
                });
              }}
            >
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  await deleteMetaAdAccount(account.id);
                  toast.success("Removido");
                });
              }}
            >
              Remover
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}
