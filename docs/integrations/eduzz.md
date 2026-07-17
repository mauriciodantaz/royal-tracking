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
| **Webhook token** | Segredo compartilhado |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. **Integrações → Eduzz**.
2. Preencha **Nome** e **Webhook token**.
3. **Adicionar integração**.
4. Copie a URL:

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
```

### 2. Configurar na Eduzz

1. No painel Eduzz, localize **Webhooks** / **Postback** / **Notificações**.
2. Cadastre a URL do Royal Tracking.
3. Use o mesmo token no campo de autenticação/secret da Eduzz e no Royal Tracking.
4. Selecione eventos de venda paga / fatura paga.

A stack valida:

```txt
x-webhook-token: <seu secret>
```

### 3. Mapear destino

Configure mapeamentos `Purchase` → Meta CAPI e/ou GA4.

## Como testar

1. Venda de teste na Eduzz.
2. Confira **Eventos** / **Faturamento** no painel.
3. Valide envio aos destinos mapeados.

## Links

- [INTEGRATIONS.md](../INTEGRATIONS.md)
