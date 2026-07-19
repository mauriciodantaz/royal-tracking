# RD Conversas — WhatsApp (Tallos)

Cada conta RD Conversas (Tallos) vira uma connection no Royal Tracking. O webhook é **manual** no painel Tallos; a stack só grava Lead quando a mensagem inbound contém `[ticket=nome:valor]`.

## Pré-requisitos

- Conta RD Station Conversas (Tallos)
- API token JWT em **Apps e Integrações → API**
- Stack Royal Tracking no ar (`NEXTAUTH_URL` / app URL pública)
- Acesso a [Tallos → Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “WA Conversas”) |
| **API token Tallos** | Bearer JWT da API Conversas (`api.tallos.com.br`) |
| **Nome do ticket (opcional)** | Prefixo em `[ticket=NOME:…]`; vazio = slug do `PROJECT_NAME` |

## O que acontece ao salvar

1. Validamos o token (`GET https://api.tallos.com.br/v2/employees`).
2. Geramos um webhook secret interno.
3. Exibimos a URL inbound completa para você colar no Tallos (não há registro automático via API).

URL inbound:

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}?token=…
```

### Configurar no Tallos

1. Abra [Integrações → Webhooks](https://app.tallos.com.br/app/integrations/webhooks).
2. Crie/edite o webhook apontando para a URL copiada no Royal Tracking (inclui `?token=`).
3. O RD Conversas envia apenas mensagens de **clientes** (não há filtro fromMe no nosso lado — o payload já é inbound).

## Payload esperado

```json
{
  "content": {
    "id": "6a5d1303b632daeddacb3383",
    "message": "ola como vai [ticket=marca:abc123]",
    "type": "text",
    "action": "on_attendance"
  },
  "contact": {
    "id": "6a3d7c3fb3afda03acb3bae7",
    "name": "Mauricio Dantas",
    "phone": "5511998311638",
    "channel": "whatsapp",
    "channel_label": "FIXO"
  }
}
```

## Filtros

- Aceita só `content.type = text` (ou ausente)
- Exige `content.id`, `content.message` e `contact.phone`
- Só persiste + dispara Lead com `[ticket=nome:valor]` no texto

## Ticket e atribuição

Igual Evolution/UazAPI: ticket = chave; `fbp`/`fbc`/`ga_client_id`/click IDs vêm do visitor da sessão web.

## Gerador wa.me

Na página da connection: telefone + mensagem → link encoded.  
**Não remova** a linha `[ticket=…:…]` se quiser Lead rastreado.

## Notas

- RD Station **CRM** e **Marketing** neste hub usam **OAuth** — não este formulário.
- Se o token for revogado no Tallos, a validação ao editar a connection falha; o webhook inbound continua autenticando pelo `?token=` da URL até você regenerar a connection.

## Links

- [API Conversas v2 — autenticação](https://developers.rdstation.com/reference/conversas-v2-authentication)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
