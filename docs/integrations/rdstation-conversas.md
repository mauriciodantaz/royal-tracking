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

1. Geramos um slug curto interno — **a própria URL é o segredo** (Tallos não envia header custom; não exija `x-webhook-token` no Tallos).
2. Exibimos a **URL pronta** para colar no Tallos.

```txt
https://SEU_DOMINIO/api/w/{slug}
```

Trate essa URL como senha: não publique em docs públicos nem em tickets abertos. Ver [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

### Configurar no Tallos

1. Abra [Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks).
2. Escolha **Integração com Webhook**.
3. Método **POST**, cole a URL copiada no Royal Tracking.
4. **Ative todas as opções** do webhook.
5. Salve.

Após upgrade da stack: **nada a reconfigurar** (auth continua sendo a URL).

A partir daí o fluxo é o mesmo do UazAPI: escutamos, descartamos o que não tem ticket, e com `[rt:código]` viramos Lead → Meta/GA4.

## Remoção da connection

O Royal Tracking **não** remove o webhook no Tallos (não há API de registro/remoção da nossa parte). Ao excluir a connection:

1. Apague (ou desative) o webhook correspondente em [Tallos → Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks).
2. Use a mesma URL que estava no painel (`/api/w/{slug}`) para achar o registro certo.

Enquanto o webhook Tallos apontar para uma URL órfã, o Tallos continua enviando POSTs que a stack ignora/404 — limpe no Tallos para evitar ruído.

## Filtros

- Payload Tallos `{ content, contact }` (texto do cliente)
- Persiste + dispara Lead com `[rt:código]` (ex. `[rt:xK9m2pQ7]`), com `ctwa_clid` / referral, **ou** fallback por telefone na 1ª mensagem do número
- Mensagens seguintes do mesmo telefone sem ticket/CTWA não geram outro Lead

## Ticket e atribuição

A mensagem do visitante fica intacta; a linha `[rt:…]` no final identifica o visitor da sessão web.

**CTWA:** metadata de anúncio Click-to-WhatsApp, quando o Tallos/repassa, cria Lead sem ticket.

**Sem ticket:** match por telefone ou Lead orgânico — veja [ATTRIBUTION-CHECKLIST.md](../ATTRIBUTION-CHECKLIST.md) trilha 5.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
Prefira manter `[rt:…]`; sem o ticket o fallback por telefone ainda registra o Lead.

## Links

- Auth inbound: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
