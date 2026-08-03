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

O app precisa ser do produto **RD Station CRM** (credenciais de Marketing não autenticam a CRM API v2). Mesmo split do n8n:

| Campo | Valor |
|---|---|
| Authorization URL | `https://accounts.rdstation.com/oauth/authorize` |
| Access Token URL | `https://api.rd.services/oauth2/token` |
| Scope / Auth URI params | `scope=read write` |
| Token body | `application/x-www-form-urlencoded` |

Callback no app RD = a URL mostrada no painel (`…/oauth/callback`), não a do n8n.

## Como conectar

1. **Integrações → RD Station CRM**.
2. Preencha Nome, Client ID e Client Secret → **Salvar**.
3. Clique em **Conectar com OAuth** e autorize na RD (conta CRM).
4. Após o callback, o sistema:
   - sincroniza funis e estágios (CRM API v2);
   - cria webhooks apontando para `/api/w/{slug}` com header `x-webhook-token` (secret gerado pela stack);
   - sugere mapeamentos estágio → evento Meta / GA4;
   - cria linhas de status **Ganho (`won`)** / **Perda (`lost`)** (padrão: won → Purchase / purchase; lost sem evento até você mapear).
5. Ajuste as tabelas de mapeamento e salve.

Auth inbound: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md). Em geral **nada a reconfigurar** após upgrade da stack (a RD já envia o header).

## Mapeamento estágio → eventos

Cada funil tem um toggle **Ativo / Desativado**:

- **Ativo:** mostra as etapas e os selects Meta/GA4
- **Desativado:** mostra só o nome do funil; webhooks desse funil **não** emitem Meta/GA4 (won/lost globais seguem o mapa de status)

Para cada estágio do funil ativo, escolha:

- **Evento Meta** (ex.: `Lead`, `InitiateCheckout`, `Purchase`) — “Não enviar” = não enviar à Meta
- **Evento GA4** (ex.: `generate_lead`, `begin_checkout`, `purchase`) — “Não enviar” = não enviar ao GA4

O mesmo `event_id` determinístico (`sha256(rdcrm:deal:{dealId}:pipe:{pipelineId}:stage:{stageId})`) é usado nos dois destinos.

## Mapeamento status da negociação (won / lost)

Na API v2 do RD CRM, a negociação tem `status` ∈ `won` | `lost` | `ongoing` | `paused` (mais `closed_at` / `lost_reason_id`).

Ganho e perda **não** usam webhook separado: chegam em `crm_deal_created` / `crm_deal_updated`. O Royal Tracking lê `status` do payload ou via `GET /deals/{id}` e dispara o mapa correspondente.

| Status | Seed padrão Meta | Seed padrão GA4 | Dedup |
|---|---|---|---|
| `won` | `Purchase` | `purchase` (com `value` se houver preço) | uma vez por deal |
| `lost` | (vazio) | (vazio) | uma vez por deal |

`event_id` de status: `sha256(rdcrm:deal:{dealId}:status:{won|lost})` — **independente** do emit por estágio (os dois podem disparar no ciclo de vida do deal).

## Identidade e deduplicação

- Contato: o webhook só traz IDs; o sistema busca `GET /deals/{id}` + `GET /contacts/{id}` para e-mail, telefone e nome, depois casa com `visitors` / leads da 1ª visita
- Reutiliza `fbp`, `fbc`, `ga_client_id`, UTMs, IP e UA quando houver match
- **Estágio:** uma vez por `deal_id + pipeline_id + stage_id` (`rd_deal_stage_emits`)
- **Status won/lost:** uma vez por `deal_id + status` (`rd_deal_status_emits`)
- Refresh OAuth automático enquanto o `refresh_token` for válido; se falhar, a UI mostra aviso de reautorização

## Remover conexão

Ao excluir a conexão, o Royal Tracking tenta apagar os webhooks remotos na RD e remove funis/maps locais (cascade).

## Links

- [CRM API v2 — Pipelines / Stages / Webhooks](https://developers.rdstation.com/crm-v2)
- [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
