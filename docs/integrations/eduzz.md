# Eduzz — webhook de compras

A Eduzz envia compras para o Royal Tracking via **webhook inbound**. Assim como Hotmart/Kiwify, o fluxo é **só server**.

## Pré-requisitos

- Conta Eduzz
- Acesso a webhooks / notificações de venda
- Stack Royal Tracking com HTTPS público

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Eduzz”) |
| **Webhook token** | Segredo compartilhado — **obrigatório** em todo POST |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. **Integrações → Eduzz**.
2. Preencha **Nome** e **Webhook token**.
3. **Adicionar integração**.
4. Copie a URL da conexão.

### 2. Configurar na Eduzz

**A — URL longa + header:**

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <Webhook token da conexão>
```

**B — URL curta + query:**

```txt
https://SEU_DOMINIO/api/w/{slug}?token=<Webhook token da conexão>
```

Sem token válido → **401**.

1. Painel Eduzz → **Webhooks** / **Postback** / **Notificações**.
2. Cadastre a URL e o mesmo secret/token da conexão.
3. Selecione eventos de venda paga / fatura paga.

### 3. Mapear destino

Configure mapeamentos `Purchase` → Meta CAPI e/ou GA4.

## Migração

URL curta antiga **sem** `?token=` deixa de funcionar após o harden. Atualize na Eduzz — ver [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

## Como testar

1. Venda de teste na Eduzz.
2. Confira **Eventos** / **Faturamento** no painel.
3. Valide envio aos destinos mapeados.

## Links

- [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
