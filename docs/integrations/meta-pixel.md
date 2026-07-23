# Meta (CAPI / Pixel) — credenciais

Use estas credenciais para conectar um pixel Meta no Royal Tracking. O modo padrão é **web + server**: o snippet dispara o Pixel no browser e a API envia CAPI no servidor com o **mesmo `event_id`** (deduplicação).

## Pré-requisitos

- Conta no [Meta Business Manager](https://business.facebook.com/)
- Um **Pixel** criado (Events Manager)
- Permissão de administrador no pixel / business

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Pixel Royal Growth”) |
| **Pixel ID** | ID numérico do pixel |
| **Token CAPI** | Access token para a Conversions API |
| **Test event code** | Código opcional da aba Test Events (ex.: `TEST12345`) |

## Como obter o Pixel ID

1. Abra o [Events Manager](https://business.facebook.com/events_manager2).
2. Selecione o pixel desejado.
3. Vá em **Configurações** (Settings) do pixel.
4. Copie o **ID do conjunto de dados / Pixel ID** (somente números).

## Como gerar o Token CAPI

1. No mesmo pixel, em **Configurações**.
2. Role até **Conversions API** / **API de Conversões**.
3. Clique em **Gerar token de acesso** (Generate access token).
4. Copie o token imediatamente e cole no campo **Token CAPI** do Royal Tracking.

> O token não é exibido de novo depois. Se perder, gere outro.

Escopos típicos necessários: permissão de enviar eventos para o pixel (gerado pelo próprio Events Manager).

## Test event code (opcional)

Útil para validar no Events Manager sem misturar com produção:

1. No Events Manager, abra o pixel → **Testar eventos** (Test events).
2. Copie o código que começa com `TEST…`.
3. Cole em **Test event code** na conexão (ou no código de teste padrão da stack).

Remova o código quando for para produção real.

## Configurar no Royal Tracking

1. Vá em **Integrações → Meta (CAPI / Pixel)**.
2. Preencha Nome, Pixel ID e Token CAPI.
3. Clique em **Adicionar integração** — a stack valida o Pixel/token na Meta antes de salvar. Se falhar, nada é gravado e o erro da Meta aparece no toast.
4. Confirme mapeamentos (ex.: `PageView`, `Lead`, `Purchase` → este pixel).
5. Valide no Meta Events Manager → **Eventos de teste** (tráfego real do site).

## Modo web + server

Com o snippet no site e esta conexão ativa:

- O browser carrega o Pixel (`/api/meta/ids`) e dispara `fbq` com `eventID`.
- O servidor envia CAPI com o mesmo `event_id`.
- A Meta deduplica; o painel classifica web+server / só server / só web.

## `action_source` e CTWA

- Eventos de site/forms/compra usam `action_source: website`.
- Leads de Click-to-WhatsApp com `ctwa_clid` usam `action_source: business_messaging` e enviam `ctwa_clid` em `user_data`.
- Evento aceito na CAPI **não** implica atribuição automática no Ads Manager — veja [INTEGRATIONS.md](../INTEGRATIONS.md#verdade-operacional-vs-ads-manager).

## Links oficiais

- [Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Events Manager](https://www.facebook.com/business/help/952192354843755)
