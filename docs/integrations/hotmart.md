# Hotmart — webhook de compras

A Hotmart envia compras para o Royal Tracking via **webhook inbound**. Não há Pixel no checkout Hotmart: o evento entra como **só server** (`ingest_path=webhook`).

## Pré-requisitos

- Conta Hotmart (produtor)
- Acesso a **Ferramentas → Webhook** (ou Integrações / Notificações, conforme o painel atual)
- Stack Royal Tracking no ar (URL pública HTTPS)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Hotmart Principal”) |
| **Webhook token / hottok** | Segredo compartilhado — **obrigatório** em todo POST (mín. 8 caracteres) |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. Vá em **Integrações → Hotmart**.
2. Preencha **Nome** e um **Webhook token** forte (o mesmo valor nos dois lados — Hotmart e Royal Tracking).
3. Clique em **Adicionar integração**.
4. Na lista de contas, copie a URL da conexão (curta ou longa).

### 2. Configurar na Hotmart

Use **uma** destas formas (ambas exigem o mesmo token da conexão):

**A — URL longa + header** (preferida se a Hotmart permitir header):

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <Webhook token da conexão>
```

**B — URL curta + query** (quando só dá para colar URL):

```txt
https://SEU_DOMINIO/api/w/{slug}?token=<Webhook token da conexão>
```

Também aceitos: `Authorization: Bearer <token>` ou body `hottok` com o mesmo valor.

Sem token válido a stack responde **401**.

1. No painel Hotmart, abra **Webhooks** / **Integrações**.
2. Crie o webhook com a URL (e header, se disponível).
3. Selecione eventos de compra aprovada / pagamento confirmado.

### 3. Mapear destino

Em **Integrações**, garanta mapeamentos `Purchase` → Meta CAPI e/ou GA4.

## Migração (stack já em produção)

Se a URL curta `/api/w/{slug}` estava cadastrada **sem** `?token=`, atualize na Hotmart após o upgrade — senão os POSTs passam a falhar com 401. Detalhes: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md).

## Como testar

1. Compra de teste (ou “enviar teste” da Hotmart, se disponível).
2. Royal Tracking → **Faturamento** / **Eventos**: `Purchase`, canal **só server**, `webhook`.
3. Confira Meta Events Manager / GA4 se os destinos estiverem mapeados.

## Links

- Auth de webhooks: [WEBHOOK-AUTH.md](../WEBHOOK-AUTH.md)
- Hub: [INTEGRATIONS.md](../INTEGRATIONS.md)
