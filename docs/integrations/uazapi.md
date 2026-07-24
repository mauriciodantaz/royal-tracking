# UazAPI Go — WhatsApp cloud

Cada **instância** UazAPI Go (cloud) vira uma connection no Royal Tracking. A stack registra o webhook sozinha e só grava Lead quando a mensagem inbound contém `[rt:código]`.

## Pré-requisitos

- Conta UazAPI Go cloud com Base URL **HTTPS** (ex. `https://seu-sub.uazapi.com`)
- **Token da instância** (header `token`) — não use admintoken global
- Stack Royal Tracking no ar (`NEXTAUTH_URL` / app URL pública)

A stack **recusa** `http://`, localhost e IPs privados na Base URL (proteção SSRF).

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “WA Ads”) |
| **Base URL** | Servidor HTTPS da instância (sem barra no fim) |
| **Token da instância** | Credencial daquela instância |

Várias connections = várias instâncias.

## O que acontece ao salvar

1. Validamos o token (`/instance/status` ou `/status`).
2. Geramos um webhook secret + slug curto.
3. Registramos um webhook **próprio** na UazAPI em **modo avançado**:
   - se já existir webhook com a mesma URL do RT → `action: "update"` nesse ID
   - senão → `action: "add"` (cria um novo; **não** sobrescreve outros webhooks da instância)
   - após criar, se a resposta não trouxer o ID, consultamos `GET /webhook` e localizamos pela URL
   - remove duplicatas acidentais com a mesma URL do RT
4. Guardamos o `id` do webhook na connection (`metadata.whatsapp_webhook.uazapi_webhook_id`).
5. Abrir a página da integração **não** re-registra o webhook (só gera a URL curta).

Eventos: `messages`. Exclusões: `wasSentByApi`, `isGroupYes`.

URL inbound (curta):

```txt
https://SEU_DOMINIO/api/w/{slug}
```

A UazAPI envia `x-webhook-token` (secret da stack). POSTs sem token → **401**. Ver [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

Se falhar, a connection fica salva com webhook pendente — use **Reconfigurar webhook**.

## Exclusão da integração

Ao remover a connection no Royal Tracking, a stack chama `action: "delete"` com o ID do **nosso** webhook. O(s) webhook(s) que você já tinha na instância **não** são apagados.

## Filtros

- Ignora mensagens da conta / enviadas pela API (`fromMe` / wasSentByApi)
- Ignora grupos
- Persiste + dispara Lead com `[rt:código]`, com `ctwa_clid` / referral, **ou** fallback por telefone (1ª mensagem do número)

## Ticket e atribuição

Igual Evolution: a mensagem fica intacta; `[rt:…]` no final liga ao visitor da sessão web.

**CTWA:** se o webhook trouxer `referral.ctwa_clid`, cria Lead sem ticket e envia CAPI `business_messaging`.

**Sem ticket:** match por telefone ou Lead orgânico na 1ª vez — veja [ATTRIBUTION-CHECKLIST.md](../ATTRIBUTION-CHECKLIST.md) trilha 5.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
Prefira manter `[rt:…]`; sem o ticket o fallback por telefone ainda registra o Lead.

## Links

- [Documentação UazAPI Go](https://docs.uazapi.com/)
- Auth inbound: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
