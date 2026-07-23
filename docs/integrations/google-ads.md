# Google Ads — conversões offline / Enhanced Conversions

Upload server-side de conversões com **GCLID** (ou `wbraid`/`gbraid`) e identificadores hasheados (ECL), via OAuth + developer token.

## Pré-requisitos

- Conta Google Ads com ação de conversão **importada / offline** (ou compatível com upload)
- App OAuth no Google Cloud com scope `https://www.googleapis.com/auth/adwords`
- Env na stack:
  - `GOOGLE_ADS_CLIENT_ID`
  - `GOOGLE_ADS_CLIENT_SECRET`
  - `GOOGLE_ADS_DEVELOPER_TOKEN`

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno |
| **Customer ID** | ID da conta Ads (`123-456-7890` ou só números) |
| **Conversion Action ID** | ID numérico da ação de conversão |
| **Login Customer ID** | MCC (opcional), se o OAuth for da conta gerente |

Fluxo: crie a conexão → **Conectar com Google** (OAuth) → edite e salve Customer ID + Conversion Action ID.

## Como obter o Conversion Action ID

1. Google Ads → **Metas** → **Conversões**.
2. Abra a ação desejada.
3. Na URL ou nos detalhes, copie o ID numérico da conversion action.
4. A ação precisa aceitar upload / Enhanced Conversions for Leads.

## O que é enviado

Quando um evento (Lead, Purchase, estágio CRM mapeado, etc.) chega ao dispatcher e existe `gclid` (ou wbraid/gbraid) no visitor:

- `UploadClickConversions` na Google Ads API
- `userIdentifiers` com email/telefone **já SHA-256** (Enhanced Conversions)
- `orderId` = `event_id` (dedupe razoável)
- valor/moeda quando houver `custom_data`

Sem click ID → delivery `skipped` (`missing_click_id`) — não é erro crítico.

## Mapeamentos

- Snippet / WhatsApp / marketplace: use **Integrações → mapeamentos** com destino Google Ads (como Meta/GA4).
- RD CRM / Pipedrive / RD MKT: ao emitir estágio com Meta ou GA4 mapeado, a stack também tenta Google Ads ativos (mesma conversion action da conexão).

## Verdade operacional

Upload ok **não garante** atribuição no Google Ads UI. O painel Royal Tracking continua sendo a verdade operacional — veja [INTEGRATIONS.md](../INTEGRATIONS.md#verdade-operacional-vs-ads-manager).

## Links

- [Enhanced Conversions for Leads](https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions/overview)
- [Upload click conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks)
