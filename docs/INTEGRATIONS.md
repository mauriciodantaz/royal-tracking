# Hub de Integrações

Aba **Integrações** (`/dashboard/integracoes`): catálogo multi-módulo e multi-conta.

Guias de credenciais (não-OAuth): [`docs/integrations/`](./integrations/) — no painel, **Precisa de ajuda com estes campos?** em cada plataforma.

## Conceito

- **Fontes (inbound):** snippet/forms, Hotmart, Kiwify, Eduzz, RD CRM/MKT, Pipedrive, Evolution API, UazAPI Go, RD Conversas (Tallos WhatsApp)
- **Destinos (outbound):** Meta e GA4 em modo **web + server** (Pixel/gtag no browser + CAPI/MP no servidor, deduplicação por `event_id`); Google Ads / Meta Ads (insights)
- **Mapeamentos:** `source_event` → N `dest_connection` + `dest_event_name`
- **Dispatcher:** fan-out com `integration_delivery_log`
- **Compras marketplace:** webhook = **só server** (`ingest_path=webhook`); não há Pixel no checkout Hotmart/Kiwify/Eduzz

## Preferências por módulo

| Onde | Setting |
|------|---------|
| Site / Forms | Moeda padrão (`BRL`) para compras sem currency |
| Meta (CAPI) | `test_event_code` padrão da stack + opcional por pixel |
| Hotmart / Kiwify / Eduzz | Webhook secret por conexão |

## Webhooks

URL curta (preferida na UI e nos registros remotos):

```
POST /api/w/{slug}
```

Legado (ainda aceito):

```
POST /api/webhook/in/{connectionId}
Header: x-webhook-token: <secret da conexão>
```

## OAuth

**RD CRM / RD Marketing:** Client ID e Client Secret na UI (por conexão), cifrados em `integration_connections.config`. Callback visível em Integrações. Env Portainer (`RDSTATION_*_CLIENT_ID/SECRET`) só como fallback legado.

**Google Ads:** OAuth + upload de conversões. Env na stack/Portainer:

- `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN` (obrigatório para upload)

Guia: [`docs/integrations/google-ads.md`](./integrations/google-ads.md).

Start: `/api/integrations/{provider}/oauth/start?connection_id=…`  
Callback: `/api/integrations/{provider}/oauth/callback`

Tokens e refresh ficam cifrados. `refreshConnectionIfNeeded` / `getValidAccessToken` renovam antes de cada chamada RD.

Funis/maps: migration `004_rd_funnels.sql`. Webhooks inbound: `/api/webhook/in/{connectionId}`.

Checklist empírico das trilhas: [`docs/ATTRIBUTION-CHECKLIST.md`](./ATTRIBUTION-CHECKLIST.md).

## Identidade do lead e janela de atribuição

- Identidade **OR**: e-mail **ou** telefone casam o mesmo perfil (`matchAndMergeVisitor`); se os dois apontarem para visitors distintos, há merge no mais antigo (`first_lead_at` / `created_at`).
- Telefone BR normalizado com prefixo `55` antes do hash (10/11 dígitos com DDD).
- `first_lead_at` + snapshot `ft_*` congelam o first-touch na primeira entrada com PII.
- Na **conversão** (Purchase / estágio CRM mapeado), se `now - first_lead_at ≤ 30 dias`, o dispatch usa o snapshot first-touch; fora da janela usa last-touch atual do `visitors`.
- WhatsApp sem `[rt:…]`: tenta match por telefone; se for a 1ª vez sem histórico, cria Lead orgânico com os dados da plataforma (não descarta a mensagem).

## Verdade operacional vs Ads Manager

O **painel Royal Tracking** é a camada de verdade operacional (origem da conversa, ticket, `gclid`/`ctwa_clid`, estágios CRM, compras marketplace).

Eventos enviados à Meta CAPI / Google Ads / GA4 **melhoram o sinal de otimização**, mas **não garantem** que o Ads Manager atribua a conversão à campanha (iOS, janelas de atribuição, qualidade de match, Status ads sem `ctwa_clid`, etc.).

Na prática:

1. Use o painel (e exportações) para medir funil e receita atribuída.
2. Cruze gasto do gerenciador de anúncios com conversões internas.
3. Trate Meta/Google como destinos de feedback — não como única fonte de verdade.

## Schema

Migrations `db/migrations/*.sql` — aplicadas no boot (inclui `014_lead_identity_attribution.sql`).
