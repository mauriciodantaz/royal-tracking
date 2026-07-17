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
| **Webhook token** | Segredo compartilhado entre Kiwify e a stack |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. **Integrações → Kiwify**.
2. Preencha **Nome** e um **Webhook token** (senha longa que você define).
3. **Adicionar integração**.
4. Copie a URL da conexão:

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
```

### 2. Configurar na Kiwify

1. No painel Kiwify, abra **Integrações** ou **Webhooks**.
2. Adicione a URL acima como endpoint.
3. Configure o mesmo **token/secret** usado no Royal Tracking.
4. Ative eventos de venda aprovada / compra.

Header esperado pela stack:

```txt
x-webhook-token: <seu secret>
```

### 3. Mapear destino

Mapeie `Purchase` → Meta e/ou GA4 nas Integrações.

## Como testar

1. Compra de teste na Kiwify.
2. Royal Tracking → **Eventos** / **Faturamento**: `Purchase`, canal só server.
3. Destinos (CAPI/MP) devem receber o evento se mapeados.

## Links

- [INTEGRATIONS.md](../INTEGRATIONS.md)
