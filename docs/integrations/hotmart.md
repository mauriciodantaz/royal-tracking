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
| **Webhook token / hottok** | Segredo que a Hotmart envia e que a stack valida |

## Passo a passo

### 1. Criar a conexão no Royal Tracking

1. Vá em **Integrações → Hotmart**.
2. Preencha **Nome** e um **Webhook token** forte (você escolhe a string secreta, ou use o hottok que a Hotmart mostrar — o importante é ser o **mesmo** nos dois lados).
3. Clique em **Adicionar integração**.
4. Na lista de contas, copie a URL gerada:

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
```

### 2. Configurar na Hotmart

1. No painel Hotmart, abra a área de **Webhooks** / **Integrações**.
2. Crie um webhook apontando para a URL copiada acima.
3. Configure o token / **hottok** com o **mesmo valor** do campo **Webhook token** no Royal Tracking.
4. Selecione eventos de compra aprovada / pagamento confirmado (conforme opções da Hotmart).

A stack valida o header:

```txt
x-webhook-token: <seu secret>
```

Também aceita `Authorization: Bearer <secret>` ou `?token=` em alguns fluxos.

### 3. Mapear destino

Em **Integrações**, garanta mapeamentos `Purchase` → Meta CAPI e/ou GA4, para a compra fan-outar aos destinos.

## Como testar

1. Faça uma compra de teste (ou use o “enviar teste” da Hotmart, se disponível).
2. No Royal Tracking: **Faturamento** / **Eventos** — deve aparecer `Purchase` com canal **só server** e `webhook`.
3. Confira Meta Events Manager / GA4 se os destinos estiverem mapeados.

## Links

- Documentação de webhooks da Hotmart (painel do produtor)
- Visão geral do hub: [INTEGRATIONS.md](../INTEGRATIONS.md)
