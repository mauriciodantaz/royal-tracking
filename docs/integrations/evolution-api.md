# Evolution API — WhatsApp self-hosted

Cada **instância** Evolution vira uma connection no Royal Tracking. A stack registra o webhook sozinha e só grava Lead quando a mensagem inbound contém `[rt:código]`.

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

Você pode cadastrar **várias** connections (uma por instância).

## Webhook (um por instância)

A Evolution só permite **um** webhook por instância. Diferente da UazAPI, não dá para “adicionar o nosso ao lado” do seu.

Comportamento do Royal Tracking:

1. Validamos o acesso (`/instance/connectionState/{instance}`).
2. Geramos um webhook secret + slug curto.
3. Consultamos `GET /webhook/find/{instance}`:
   - se **não houver** URL (ou estiver desativado) → configuramos a nossa;
   - se a URL **já for** a do Royal Tracking → só atualizamos (token/eventos);
   - se houver **outra URL** (CRM, n8n, etc.) → **não sobrescrevemos**. A connection fica com webhook pendente e a mensagem pede para usar outra instância ou liberar o slot.
4. Quando configuramos, usamos `POST /webhook/set/{instance}` apontando para:

```txt
https://SEU_DOMINIO/api/w/{slug}
```

Evento: `MESSAGES_UPSERT`. Header `x-webhook-token` também é enviado.

Ao **excluir** a connection no Royal Tracking, se o webhook da instância ainda apontar para a nossa URL, desativamos (`enabled: false`). Webhooks de terceiros não são tocados.

Se a Evolution recusar ou o slot estiver ocupado, a connection **fica salva** com status pendente — use **Reconfigurar webhook** depois de liberar a instância.

## Filtros

- Ignora mensagens `fromMe` (enviadas pela conta conectada)
- Ignora grupos
- Só persiste + dispara Lead se o texto tiver `[rt:código]`

## Ticket e atribuição

O snippet no site coloca `[rt:…]` no final do `text=` do `wa.me`. O código curto aponta para o visitor da sessão web.

**Click-to-WhatsApp (CTWA):** se o webhook trouxer `referral.ctwa_clid` (ou equivalente no payload), o Royal Tracking cria Lead mesmo **sem** ticket e envia CAPI com `business_messaging`. Evolution nem sempre repassa esse metadata — nesse caso continue usando ticket/`[rt:…]`. O painel é a verdade operacional; o Ads Manager pode não atribuir mesmo com CAPI ok.

## Gerador wa.me

Na página da connection: informe telefone + mensagem → copie o link.  
**Não remova** a linha `[rt:…]` se quiser Lead rastreado.

## Mapear destino

Mapeamentos `Lead` → Meta CAPI / GA4 são criados automaticamente para pixels/GA4 ativos. Ajuste em **Integrações** se precisar.

## Links

- [Webhooks Evolution](https://doc.evolution-api.com/)
- Visão geral: [INTEGRATIONS.md](../INTEGRATIONS.md)
