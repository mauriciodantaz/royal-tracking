# RD Conversas — WhatsApp (webhook Tallos)

Igual UazAPI/Evolution no fluxo de Lead: a stack **só escuta** mensagens e grava Lead quando o texto contém `[rt:código]`. Não usamos a API Tallos — só o webhook inbound.

## Pré-requisitos

- Conta RD Station Conversas (Tallos)
- Stack Royal Tracking no ar (`NEXTAUTH_URL` / app URL pública)
- Acesso a [Tallos → Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “WA Conversas”) |

## O que acontece ao salvar

1. Geramos um slug curto interno (a própria URL autentica).
2. Exibimos a **URL pronta** para colar no Tallos.

```txt
https://SEU_DOMINIO/api/w/{slug}
```

### Configurar no Tallos

1. Abra [Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks).
2. Escolha **Integração com Webhook**.
3. Método **POST**, cole a URL copiada no Royal Tracking.
4. **Ative todas as opções** do webhook.
5. Salve.

A partir daí o fluxo é o mesmo do UazAPI: escutamos, descartamos o que não tem ticket, e com `[rt:código]` viramos Lead → Meta/GA4.

## Filtros

- Payload Tallos `{ content, contact }` (texto do cliente)
- Só persiste + dispara Lead com `[rt:código]` no texto (ex. `[rt:xK9m2pQ7]`)
- Demais mensagens são ignoradas (ack sem Lead)

## Ticket e atribuição

A mensagem do visitante fica intacta; só a linha `[rt:…]` no final identifica o visitor da sessão web.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
**Não remova** a linha `[rt:…]` se quiser Lead rastreado.

## Links

- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
