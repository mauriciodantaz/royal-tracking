# RD Station CRM — OAuth2 + funis → Meta / GA4

Conecte o **RD Station CRM** via OAuth (app na RD App Store). O Royal Tracking sincroniza funis/estágios, cria webhooks `crm_deal_created` / `crm_deal_updated` e envia eventos server-side para Meta CAPI e GA4 Measurement Protocol.

## Pré-requisitos

- Conta RD Station CRM com permissão para criar apps / autorizar integrações
- App criado na [RD App Store](https://appstore.rdstation.com/) (Client ID + Client Secret)
- Destinos **Meta Pixel (CAPI)** e/ou **GA4** já conectados nesta stack

## URL de callback (obrigatória no app RD)

Cadastre exatamente esta URL no app da RD App Store:

```text
{NEXTAUTH_URL}/api/integrations/rdstation_crm/oauth/callback
```

Exemplo: `https://tracking.royalgrowth.com.br/api/integrations/rdstation_crm/oauth/callback`

A URL também aparece copiável na tela **Integrações → RD Station CRM**.

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno da conexão |
| **Client ID** | Do app RD App Store |
| **Client Secret** | Do app RD App Store (cifrado no Postgres) |

Env Portainer (`RDSTATION_CRM_CLIENT_ID` / `SECRET`) fica só como fallback legado — prefira a UI.

## App na RD App Store

O app precisa ser do produto **RD Station CRM** (credenciais de Marketing não autenticam a CRM API v2).

OAuth CRM usa:
- Authorize: `https://accounts.rdstation.com/oauth/authorize`
- Token: `https://api.rd.services/oauth2/token`

## Como conectar

1. **Integrações → RD Station CRM**.
2. Preencha Nome, Client ID e Client Secret → **Salvar**.
3. Clique em **Conectar com OAuth** e autorize na RD (conta CRM).
4. Após o callback, o sistema:
   - sincroniza funis e estágios (CRM API v2);
   - cria webhooks apontando para `/api/webhook/in/{connectionId}` com header `x-webhook-token`;
   - sugere mapeamentos estágio → evento Meta / GA4.
5. Ajuste a tabela de mapeamento e salve.

## Mapeamento estágio → eventos

Para cada estágio do funil, escolha:

- **Evento Meta** (ex.: `Lead`, `InitiateCheckout`, `Purchase`) — vazio = não enviar à Meta
- **Evento GA4** (ex.: `generate_lead`, `begin_checkout`, `purchase`) — vazio = não enviar ao GA4

O mesmo `event_id` determinístico (`sha256(rdcrm:deal:{dealId}:pipe:{pipelineId}:stage:{stageId})`) é usado nos dois destinos.

## Identidade e deduplicação

- Contato do deal é casado por e-mail/telefone hash com `visitors` / leads da 1ª visita
- Reutiliza `fbp`, `fbc`, `ga_client_id`, UTMs, IP e UA quando houver match
- **Uma vez por combinação** `deal_id + pipeline_id + stage_id` (claim atômico em `rd_deal_stage_emits`). Webhooks repetidos do RD no mesmo estágio → `{ deduped: true }`
- Refresh OAuth automático enquanto o `refresh_token` for válido; se falhar, a UI mostra aviso de reautorização

## Remover conexão

Ao excluir a conexão, o Royal Tracking tenta apagar os webhooks remotos na RD e remove funis/maps locais (cascade).

## Links

- [CRM API v2 — Pipelines / Stages / Webhooks](https://developers.rdstation.com/crm-v2)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
