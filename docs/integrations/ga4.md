# Google Analytics 4 — credenciais

Use estas credenciais para o modo **web + server**: o snippet carrega `gtag` no browser e o servidor envia eventos via **Measurement Protocol**, com o mesmo `event_id` para correlação interna.

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

## Identidade GA4: `_ga`, Royal FPID e `trck_user_id`

| Identificador | Onde vive | Papel |
|---|---|---|
| `_ga` | Cookie JS no site do cliente | Client ID “clássico” do gtag; enviado no body como `ga_client_id` |
| `_rt_fpid` | Cookie **HttpOnly** no host do Royal | FPID server-managed (estilo Stape / sGTM); não legível por JS nesta fase |
| `trck_user_id` | First-party no site + `visitors` | ID Royal; base do HMAC quando não há cookie/`_ga` |
| `visitors.ga_client_id` | Postgres | Identidade estável usada no Measurement Protocol |

### Install normal: nada a configurar

Com `ENCRYPTION_KEY` da stack, o HMAC do client_id sintético e o cookie `_rt_fpid` (host-only no domínio do Royal) funcionam sozinhos. Não é necessário preencher env extra no Portainer.

Casos avançados (raros): `GA_CLIENT_ID_SECRET` para separar o HMAC do `ENCRYPTION_KEY`; `GA_FPID_COOKIE_DOMAIN` se o tracking estiver em CNAME first-party e você quiser `Domain` explícito no cookie.

## Resolução de `client_id` (Measurement Protocol)

Ordem no server:

1. **`ga_cookie`** — `ga_client_id` do browser **somente se** o visitante ainda não tem identidade server-managed.
2. **`royal_fpid`** — cookie HTTP `_rt_fpid`.
3. **`visitor_stored`** — `visitors.ga_client_id`.
4. **`synthetic_trck`** — `uint32(HMAC_SHA256(secret, trck_user_id)).{visitor.created_at_unix}`.
5. **`generated`** — ID aleatório estável se houver `trck_user_id` mas o HMAC não puder rodar (sem secret).
6. **`none`** — skip (`missing_ga_client_id`) só sem qualquer identidade recuperável.

No detalhe do evento / delivery log:

- `ga_client_id_source` / `ga_client_id_resolution`
- `ga_client_id_persisted`, `ga_client_id_cookie_written`
- `browser_ga_client_id_present`, `ga_identity_mismatch`
- `ga_client_id_mask` (hash curto; logs não devem depender do ID completo)

### Política sticky (migração)

- Primeiro hit com `_ga` e sem FPID → usa o `_ga`, persiste, emite `_rt_fpid`.
- Se já existe identidade server-managed e chega um `_ga` diferente → **não troca** o `ga_client_id`; grava em `browser_ga_client_id` e marca `ga_identity_mismatch`. Continua o FPID/stored.
- Não alternar silenciosamente entre `_ga` e Royal FPID na mesma jornada.

### Adblock / cookieless

Com Adblock, o `gtag.js` e o `_ga` costumam falhar. O snippet ainda POSTa no host first-party do Royal (`credentials: include`), o server resolve identidade (FPID / synthetic) e envia o MP. O cookie `_rt_fpid` fica no **host do Royal** (não no apex do cliente), salvo CNAME + `GA_FPID_COOKIE_DOMAIN`.

O snippet só marca `client_web.ga4` quando o script real do gtag carregou (stub sozinho não conta). Um enum de estados web mais rico (`not_configured` … `failed`) fica para issue separada.

### Deduplicação e `event_id`

- `event_id` no MP é **correlação / observabilidade interna** — não assuma dedupe automático no GA4.
- Hybrid web+MP pode contar dois hits se ambos dispararem; o valor do server é recuperar bloqueios.
- **Purchase:** use sempre `transaction_id` estável (já derivado do pedido no Royal).

### Limitações de stitching / atribuição

- ID sintético / FPID recupera volume sob bloqueio, mas pode não coincidir com um `_ga` futuro no mesmo browser (daí a política sticky + `browser_ga_client_id`).
- Sem `user_id` GA4 autenticado, cross-device continua limitado.

## Como validar

1. Cookies limpos + Adblock → PageView → Detalhe GA4 com `client_id`, source `synthetic_trck` ou `royal_fpid`, sem `missing_ga_client_id`.
2. Segundo PageView → mesmo `client_id`; cookie `_rt_fpid` no host do tracking (DevTools → Application → Cookies do endpoint Royal).
3. Sem Adblock, primeiro hit com `_ga` → source `ga_cookie`.
4. Com FPID já existente, forçar `_ga` novo → source permanece stored/FPID; `ga_identity_mismatch` true; `browser_ga_client_id` preenchido.
5. Purchase → `transaction_id` estável no payload.
6. GA4 DebugView / tempo real (propriedade de teste).

## Links oficiais

- [Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Criar API secrets](https://support.google.com/analytics/answer/12817343)
