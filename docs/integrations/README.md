# Credenciais e configuração de integrações

Guias no estilo “como preencher estes campos” para cada integração do Royal Tracking.

No painel: **Integrações → [plataforma] → Precisa de ajuda com estes campos?**  
URL: `/dashboard/integracoes/{provider}/docs`

| Integração | Arquivo | Provider |
|---|---|---|
| Meta (CAPI / Pixel) | [meta-pixel.md](./meta-pixel.md) | `meta_pixel` |
| Meta Ads | [meta-ads.md](./meta-ads.md) | `meta_ads` |
| Google Analytics 4 | [ga4.md](./ga4.md) | `ga4` |
| Google Ads | [google-ads.md](./google-ads.md) | `google_ads` |
| Hotmart | [hotmart.md](./hotmart.md) | `hotmart` |
| Kiwify | [kiwify.md](./kiwify.md) | `kiwify` |
| Eduzz | [eduzz.md](./eduzz.md) | `eduzz` |
| RD Station CRM | [rdstation-crm.md](./rdstation-crm.md) | `rdstation_crm` |
| RD Station Marketing | [rdstation-mkt.md](./rdstation-mkt.md) | `rdstation_mkt` |
| RD Conversas | [rdstation-conversas.md](./rdstation-conversas.md) | `rdstation_conversas` |
| Pipedrive | [pipedrive.md](./pipedrive.md) | `pipedrive` |
| Evolution API | [evolution-api.md](./evolution-api.md) | `evolution_api` |
| UazAPI Go | [uazapi.md](./uazapi.md) | `uazapi` |
| Site / Forms | [snippet.md](./snippet.md) | `snippet` |

## Leitura cruzada (segurança)

- Auth de **todos** os webhooks inbound: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- Hub / dispatcher: [INTEGRATIONS.md](../INTEGRATIONS.md)
- Single-stack + allowlist: [SELF-HOSTED.md](../SELF-HOSTED.md)
- Checklist: [SECURITY.md](../../SECURITY.md)

RD CRM/MKT e Pipedrive: Client ID/Secret na UI (Portainer só como fallback). Google Ads OAuth ainda usa env — ver [INTEGRATIONS.md](../INTEGRATIONS.md).

**Marketplaces (Hotmart/Kiwify/Eduzz):** toda URL (curta ou longa) exige o mesmo **Webhook token** da conexão. URL curta sem `?token=` → 401.
