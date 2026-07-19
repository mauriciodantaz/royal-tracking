# UazAPI Go — WhatsApp cloud

Cada **instância** UazAPI Go (cloud) vira uma connection no Royal Tracking. A stack registra o webhook sozinha e só grava Lead quando a mensagem inbound contém `[ticket=nome:valor]`.

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
| **Nome do ticket (opcional)** | Prefixo em `[ticket=NOME:…]`; vazio = slug do `PROJECT_NAME` |

Várias connections = várias instâncias.

## O que acontece ao salvar

1. Validamos o token (`/instance/status` ou `/status`).
2. Geramos um webhook secret interno.
3. Chamamos `POST /webhook` na Base URL com eventos `messages`, excluindo `wasSentByApi` e `isGroupYes` quando a API permitir.

URL inbound:

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}?token=…
```

Se falhar, a connection fica salva com webhook pendente — use **Reconfigurar webhook**.

## Filtros

- Ignora mensagens da conta / enviadas pela API (`fromMe` / wasSentByApi)
- Ignora grupos
- Só persiste + dispara Lead com `[ticket=nome:valor]` no texto

## Ticket e atribuição

Igual Evolution: ticket = chave; `fbp`/`fbc`/`ga_client_id`/click IDs vêm do visitor da sessão web.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
**Não remova** a linha `[ticket=…:…]` se quiser Lead rastreado.

## Links

- [Documentação UazAPI Go](https://docs.uazapi.com/)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
