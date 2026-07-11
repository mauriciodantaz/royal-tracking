# Hub de Integrações

Aba **Integrações** (`/dashboard/integracoes`): catálogo multi-módulo e multi-conta.

## Conceito

- **Fontes (inbound):** snippet/forms, Hotmart, Kiwify, Eduzz, RD CRM/MKT/Conversas, Pipedrive
- **Destinos (outbound):** Meta CAPI, GA4 MP, Google Ads (fase 3), Meta Ads (insights)
- **Mapeamentos:** `source_event` → N `dest_connection` + `dest_event_name`
- **Dispatcher:** fan-out com `integration_delivery_log`

## Webhooks

| URL | Auth |
|-----|------|
| `/api/webhook/in/{connectionId}` | `x-webhook-token` = secret da conexão |
| `/api/webhook/compra` | token global em Config (legado) |

## OAuth

Env no Portainer:

- `RDSTATION_CRM_CLIENT_ID` / `RDSTATION_CRM_CLIENT_SECRET`
- `RDSTATION_MKT_CLIENT_ID` / `RDSTATION_MKT_CLIENT_SECRET`
- `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET`

Start: `/api/integrations/{provider}/oauth/start`  
Callback: `/api/integrations/{provider}/oauth/callback`

Tokens ficam cifrados em `integration_connections`. Refresh lazy em `token-refresh.ts`.

## Schema

Migration `db/migrations/002_integrations_hub.sql` — aplica no boot.
