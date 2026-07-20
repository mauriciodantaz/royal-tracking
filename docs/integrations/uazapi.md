# UazAPI Go — WhatsApp cloud

Cada **instância** UazAPI Go (cloud) vira uma connection no Royal Tracking. A stack registra o webhook sozinha e só grava Lead quando a mensagem inbound contém `[rt:código]`.

## Pré-requisitos

- Conta UazAPI Go cloud com Base URL (ex. `https://seu-sub.uazapi.com`)
- **Token da instância** (header `token`) — não use admintoken global
- Stack Royal Tracking no ar (`NEXTAUTH_URL` / app URL pública)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “WA Ads”) |
| **Base URL** | Servidor da instância (sem barra no fim) |
| **Token da instância** | Credencial daquela instância |

Várias connections = várias instâncias.

## O que acontece ao salvar

1. Validamos o token (`/instance/status` ou `/status`).
2. Geramos um webhook secret + slug curto.
3. Registramos um webhook **próprio** na UazAPI em **modo avançado**:
   - primeira vez: `action: "add"` (cria um webhook novo; **não** sobrescreve o webhook que você já tinha)
   - reconfigurar: `action: "update"` só no ID que o Royal Tracking guardou
4. Guardamos o `id` do webhook na connection (`metadata.whatsapp_webhook.uazapi_webhook_id`).

Eventos: `messages`. Exclusões: `wasSentByApi`, `isGroupYes`.

URL inbound (curta):

```txt
https://SEU_DOMINIO/api/w/{slug}
```

Se falhar, a connection fica salva com webhook pendente — use **Reconfigurar webhook**.

## Exclusão da integração

Ao remover a connection no Royal Tracking, a stack chama `action: "delete"` com o ID do **nosso** webhook. O(s) webhook(s) que você já tinha na instância **não** são apagados.

## Filtros

- Ignora mensagens da conta / enviadas pela API (`fromMe` / wasSentByApi)
- Ignora grupos
- Só persiste + dispara Lead com `[rt:código]` no texto

## Ticket e atribuição

Igual Evolution: a mensagem fica intacta; `[rt:…]` no final liga ao visitor da sessão web.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
**Não remova** a linha `[rt:…]` se quiser Lead rastreado.

## Links

- [Documentação UazAPI Go](https://docs.uazapi.com/)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
