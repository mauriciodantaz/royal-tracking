# Evolution API — WhatsApp self-hosted

Cada **instância** Evolution vira uma connection no Royal Tracking. A stack registra o webhook sozinha e só grava Lead quando a mensagem inbound contém `[ticket=nome:valor]`.

## Pré-requisitos

- Evolution API self-hosted (`latest`) com URL pública HTTPS
- Instância WhatsApp já criada (nome + **API key da instância** — não use a key global/admin)
- Stack Royal Tracking no ar (`NEXTAUTH_URL` / app URL pública)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “WA Comercial”) |
| **URL da Evolution** | Base da API (ex. `https://evolution.seudominio.com`) |
| **Nome da instância** | `instance` na Evolution |
| **API key da instância** | Token/apikey **dessa** instância |
| **Nome do ticket (opcional)** | Prefixo em `[ticket=NOME:…]`; vazio = slug do `PROJECT_NAME` |

Você pode cadastrar **várias** connections (uma por instância).

## O que acontece ao salvar

1. Validamos o acesso (`/instance/connectionState/{instance}`).
2. Geramos um webhook secret interno.
3. Chamamos `POST /webhook/set/{instance}` apontando para:

```txt
https://SEU_DOMINIO/api/w/{slug}
```

Evento: `MESSAGES_UPSERT`. Header `x-webhook-token` também é enviado.

Se a Evolution recusar, a connection **fica salva** com status de webhook pendente — use **Reconfigurar webhook**.

## Filtros

- Ignora mensagens `fromMe` (enviadas pela conta conectada)
- Ignora grupos
- Só persiste + dispara Lead se o texto tiver `[ticket=nome:valor]`

## Ticket e atribuição

O snippet no site coloca o ticket no `text=` do `wa.me`. O valor é a chave de join (`trck_user_id` preferido). Cookies (`fbp`/`fbc`/`ga_client_id`/…) vêm do visitor no banco — não do IP do webhook.

## Gerador wa.me

Na página da connection: informe telefone + mensagem → copie o link.  
**Não remova** a linha `[ticket=…:…]` se quiser Lead rastreado.

## Mapear destino

Mapeamentos `Lead` → Meta CAPI / GA4 são criados automaticamente para pixels/GA4 ativos. Ajuste em **Integrações** se precisar.

## Links

- [Webhooks Evolution](https://doc.evolution-api.com/)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
