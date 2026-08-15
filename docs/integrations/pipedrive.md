# Pipedrive — OAuth (Private app)

Conecte o Pipedrive com **OAuth 2.0** (Private app no Developer Hub). Após autorizar, o Royal Tracking sincroniza funis/estágios, registra o webhook de deals automaticamente e dispara Meta CAPI / GA4 **uma vez por negociação + estágio** (e uma vez por won/lost).

## Pré-requisitos

- Conta Pipedrive (sandbox de developer ou produção)
- App **Private** no [Developer Hub](https://pipedrive.readme.io/docs/marketplace-creating-a-proper-app)
- Escopos mínimos no app: `base`, `deals:read`, `products:read`, `contacts:read`, `webhooks:full` (e admin se o Hub exigir para webhooks do app)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno |
| **Client ID** | Do app no Developer Hub |
| **Client Secret** | Do app no Developer Hub |

## Como criar o app e obter as credenciais

1. Acesse a **developer sandbox** → **Settings → Developer Hub**.
2. **Create an app** → Private.
3. Em **Basic info**, preencha o nome e a **OAuth Callback URL** (copie a URL exibida em Integrações → Pipedrive).
4. Em **OAuth & access scopes**, copie `client_id` e `client_secret` e marque os escopos acima.
5. Coloque o app em **live** quando for usar em produção (private apps podem ser instalados por link).

## Configurar no Royal Tracking

1. **Integrações → Pipedrive**.
2. Preencha Nome, Client ID e Client Secret → **Adicionar / Salvar**.
3. Clique em **Conectar com OAuth** e autorize na Pipedrive.
4. O sistema:
   - grava `api_domain`, `company_id` e tokens;
   - sincroniza pipelines/stages;
   - cria webhook v2 `*.deal` apontando para `/api/w/{slug}` (HTTP Basic);
   - seed dos mapas estágio → Meta/GA4 e won → Purchase.
5. Ajuste os mapeamentos na tabela e **Salvar mapeamentos**. Use **Sincronizar funis** se criar estágios novos no Pipedrive.

## Comportamento dos eventos

- Webhook v2 (`create` / `change` em deal).
- Disparo **só na primeira vez** que a negociação chega em um estágio (dedup por `deal + pipeline + stage`).
- Funil com toggle **Desativado** na UI: etapas ficam recolhidas e o webhook **não** emite Meta/GA4 daquele funil (won/lost globais continuam).
- Won/lost têm dedup separado.
- Match do visitante por **e-mail ou telefone** da person do deal (enrich via API só quando o claim de emit vence; retries/duplicatas são descartados sem consultar a API). Sem match, cria visitante ou emite GA4 com `client_id` sintético do deal.
- Won busca `GET /deals/{id}/products`, manda `items` no GA4 (`transaction_id` = id do deal) e grava `purchases` (`pipedrive:{dealId}`).
- **Reenviar órfãos** reenvia emits sem `events_log` e GA4 `skipped` por falta de `client_id`.
- Alterações de deal que **não** mudam estágio nem status → ignoradas sem chamada à API.

## Desinstalação

Se o usuário desinstalar o app no Pipedrive, a plataforma envia `DELETE` na callback OAuth. A conexão fica inativa e pede reautorização.

## Segurança

- Tokens e Client Secret ficam cifrados no banco (`ENCRYPTION_KEY`).
- O webhook inbound (`/api/w/{slug}`) exige HTTP Basic: user `royal-tracking`, password = secret gerado pela stack.
- Após upgrade da stack: em geral **nada a fazer** (Basic Auth já era o fluxo).
- Prefira um Private app próprio da sua stack; não compartilhe o Client Secret.
- Detalhes: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

## Env opcional (fallback legado)

```env
# PIPEDRIVE_CLIENT_ID=
# PIPEDRIVE_CLIENT_SECRET=
```

Preferência: credenciais na UI da conexão (igual RD CRM).

## Links

- [Pipedrive OAuth](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)
- [Webhooks](https://pipedrive.readme.io/docs/guide-for-webhooks)
- [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
