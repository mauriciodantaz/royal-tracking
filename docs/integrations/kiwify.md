# Kiwify — webhook de compras

A Kiwify envia compras para o Royal Tracking via **webhook inbound**. Eventos de checkout na Kiwify entram como **só server** (sem Pixel no browser do comprador).

## Pré-requisitos

- Conta Kiwify
- Acesso a **Apps / Integrações / Webhooks**
- Stack Royal Tracking com HTTPS público

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Kiwify Loja”) |
| **Webhook token** | Segredo compartilhado — **obrigatório** em todo POST |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. **Integrações → Kiwify**.
2. Preencha **Nome** e um **Webhook token** (senha longa).
3. **Adicionar integração**.
4. Copie a URL da conexão.

### 2. Configurar na Kiwify

**A — URL longa + header:**

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <Webhook token da conexão>
```

**B — URL curta + query:**

```txt
https://SEU_DOMINIO/api/w/{slug}?token=<Webhook token da conexão>
```

Também: `Authorization: Bearer <token>` ou `?token=` / body `token`.

Sem token válido → **401**.

1. Painel Kiwify → **Integrações** / **Webhooks**.
2. Cadastre a URL (e o secret/token idêntico ao Royal Tracking).
3. Ative eventos de venda aprovada / compra.

### 3. Mapear destino

Mapeie `Purchase` → Meta e/ou GA4.

## Migração

URL curta antiga **sem** `?token=` deixa de funcionar após o harden. Atualize na Kiwify — ver [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

## Como testar

1. Compra de teste na Kiwify.
2. Royal Tracking → **Eventos** / **Faturamento**: `Purchase`, canal só server.
3. Destinos (CAPI/MP) devem receber o evento se mapeados.

## Links

- [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
