# Google Analytics 4 — credenciais

Use estas credenciais para o modo **web + server**: o snippet carrega `gtag` no browser e o servidor envia eventos via **Measurement Protocol**, com o mesmo `event_id` para deduplicação.

## Pré-requisitos

- Propriedade GA4 no [Google Analytics](https://analytics.google.com/)
- Permissão de **Administrador** ou **Editor** na propriedade
- Stream de dados **Web** ativo

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “GA4 Site”) |
| **Measurement ID** | ID do stream, formato `G-XXXXXXXX` |
| **API Secret** | Segredo do Measurement Protocol (não é o Firebase/API key genérico) |

## Como obter o Measurement ID

1. Abra o GA4 → **Admin** (engrenagem).
2. Em **Coleta e modificação de dados** → **Streams de dados**.
3. Abra o stream **Web**.
4. Copie o **ID de medição** (`G-…`).

## Como criar o API Secret (Measurement Protocol)

1. No mesmo stream Web → role até **Secrets da API do Measurement Protocol** (Measurement Protocol API secrets).
2. Clique em **Criar**.
3. Dê um nome (ex.: `royal-tracking`) e confirme.
4. Copie o **Valor do secret** e cole no campo **API Secret** do Royal Tracking.

> O secret aparece só na criação. Guarde com segurança; se perder, crie outro.

## Configurar no Royal Tracking

1. **Integrações → Google Analytics 4**.
2. Preencha Nome, Measurement ID e API Secret.
3. **Adicionar integração**.
4. Confirme mapeamentos de eventos (PageView, Lead, Purchase, etc.).

O snippet busca os IDs ativos em `/api/ga4/ids` (sem secrets) para carregar o `gtag` no site do cliente.

## Resolução de `client_id` (Measurement Protocol)

O MP exige `client_id`. A ordem no server é:

1. **Cookie `_ga`** enviado pelo snippet (`ga_client_id`) — formato `XXXX.YYYY` (prefixo `GA1.1.` é removido se vier completo).
2. **`visitors.ga_client_id`** já persistido.
3. **Sintético estável** a partir de `trck_user_id` (hash → `{uint32}.{uint32}`), persistido no visitante para reuso.
4. Sem `trck_user_id` e sem cookie/stored → skip (`missing_ga_client_id`).

No detalhe do evento / delivery log, o campo `client_id_source` indica a origem: `cookie` | `visitor_stored` | `synthetic_trck` | `none`.

### Adblock / cookieless

Se o Adblock bloquear o `gtag.js`, o cookie `_ga` não nasce. O server **ainda envia** o evento ao GA4 com o `client_id` sintético (mesmo `trck_user_id` ⇒ mesmo ID). Isso recupera volume; o stitching com uma sessão gtag futura no mesmo browser pode ficar fraco se depois nascer um `_ga` diferente — quando o cookie chegar, o identify/lead **prefere o cookie** e atualiza o visitante.

O snippet só marca `client_web.ga4` / canal web GA4 quando o script real do gtag carregou (stub sozinho não conta).

## Como validar

1. No site com o snippet, abra a página (PageView).
2. No GA4: **Admin → DebugView** (com debug ativo) ou Relatórios em tempo real.
3. No Royal Tracking: **Eventos** — confira `event_id` e canal (web+server).
4. Payload do MP deve incluir `params.event_id` e `client_id`; no detalhe, `client_id_source`.
5. Com Adblock (sem `_ga`): segundo PageView deve reutilizar o mesmo `client_id` (`synthetic_trck`).
6. Sem Adblock: `client_id_source` deve ser `cookie`.

## Links oficiais

- [Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Criar API secrets](https://support.google.com/analytics/answer/12817343)
