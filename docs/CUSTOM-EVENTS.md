# Eventos personalizados

O catálogo em **Eventos → Personalizados** define um slug interno e os nomes enviados a cada destino. Qualquer origem (snippet, webhook genérico, funil CRM) pode gerar o mesmo slug. Depois da normalização, o evento usa o motor `dispatchEvent` (identidade, atribuição, dedup, Meta CAPI, GA4 MP).

## Campos

- **Slug interno**: `orcamento_aprovado` (minúsculas, números e `_`). Não use nomes nativos (`lead`, `purchase`, `page_view`).
- **Nome na Meta** e **Nome no GA4**: o que vai no payload de cada API.
- **Enviar Meta / Enviar GA4**: desliga o destino sem apagar o mapeamento.
- **Valor / itens**: se o evento carrega `value`, `currency` e `items`.
- **Parâmetros extras**: pares `chave=valor` mesclados no `custom_data` (Meta) e nos params (GA4, com sanitização).
- **Aliases**: nome recebido na origem. Uma linha `Deal won` vale para qualquer origem. `pipedrive:negociacao_ganha` vale só para aquela origem.

## Resolução

1. Alias ou slug do catálogo (evento ativo).
2. Override do funil CRM (`meta_event_name` / `ga4_event_name`).
3. `integration_event_mappings`.
4. Default: todos os pixels/GA4 ativos (Lead → `generate_lead`, etc.).

Eventos nativos do snippet (`PageView`, `Lead`, `Purchase`) **não** precisam estar no catálogo.

## Como disparar

Snippet:

```js
window.trck.event("orcamento_aprovado", { value: 500, currency: "BRL" });
```

Webhook genérico (conexão inbound autenticada):

```json
{
  "event_name": "orcamento_aprovado",
  "email": "lead@cliente.com",
  "value": 500,
  "currency": "BRL",
  "params": { "funil": "comercial" }
}
```

Sem e-mail, telefone ou `trck_user_id` o webhook é aceito mas não envia destino (`skipped: missing_identity`).

No funil Pipedrive/RD, o estágio pode apontar para um evento do catálogo ou usar texto livre nos nomes Meta/GA4.

## Logs

O log em **Eventos** guarda o slug interno em `event_name`. Os nomes enviados a Meta e GA4 aparecem no detalhe (payload/response). Skips de webhook Pipedrive vão para `integration_delivery_log` com `status=skipped`.
