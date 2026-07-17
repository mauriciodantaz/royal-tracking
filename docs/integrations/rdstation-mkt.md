# RD Station Marketing — OAuth2 + conversões → Meta / GA4

Conecte o **RD Station Marketing** via OAuth. Em vez de funis custom dinâmicos, o Royal Tracking usa **slots fixos de lifecycle** (Lead / Qualified / Opportunity / Sale + Conversão) que você mapeia para eventos Meta e GA4.

## Pré-requisitos

- Conta RD Station Marketing
- App na [RD App Store](https://appstore.rdstation.com/) com Client ID + Client Secret
- Destinos **Meta Pixel (CAPI)** e/ou **GA4** já conectados

## URL de callback

Cadastre no app RD:

```text
{NEXTAUTH_URL}/api/integrations/rdstation_mkt/oauth/callback
```

Exemplo: `https://tracking.royalgrowth.com.br/api/integrations/rdstation_mkt/oauth/callback`

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno |
| **Client ID** | App RD App Store |
| **Client Secret** | App RD App Store (cifrado) |

## Como conectar

1. **Integrações → RD Station Marketing**.
2. Salve Client ID / Secret.
3. **Conectar com OAuth**.
4. Após autorizar, o sistema:
   - popula os slots de lifecycle;
   - cria webhooks `WEBHOOK.CONVERTED` e `WEBHOOK.MARKED_OPPORTUNITY` apontando para `/api/webhook/in/{connectionId}?token=...`.
5. Mapeie cada slot → evento Meta / GA4 e salve.

## Slots de lifecycle

| Slot | Default Meta | Default GA4 |
|---|---|---|
| Lead | Lead | generate_lead |
| Qualified | Lead | generate_lead |
| Opportunity | InitiateCheckout | begin_checkout |
| Sale | Purchase | purchase |
| Conversão / Lead gerado | Lead | generate_lead |

`event_id` = `sha256(rdmkt:{contactKey}:lifecycle:{slot})`.

Emit once per contact + lifecycle slot (`rd_deal_stage_emits`); webhooks repetidos → `{ deduped: true }`.

## Identidade

Mesmo fluxo do CRM: match por e-mail/telefone → reutiliza cookies e UTMs da 1ª visita; PII hasheada na CAPI.

## Remover conexão

Excluir a conexão tenta remover as subscriptions de webhook na RD.

## Links

- [RD Marketing — Webhooks](https://developers.rdstation.com/)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
