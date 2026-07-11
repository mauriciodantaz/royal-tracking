# Royal Tracking — snippet no site do cliente

Use o domínio da **sua** instalação (uma stack por domínio). Produção RoyalServer: `tracking.royalserver.com.br`.

## Código para colar

No **`<head>`** (ou antes de `</body>`) de **todas** as páginas da landing/site:

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Só isso já:
- chama `/api/identify`
- dispara `PageView` em `/api/event`
- captura **submit de qualquer formulário** → `/api/lead` (email/telefone/campos + UTMs)
- guarda `trck_user_id` (cookie + localStorage)
- anexa `trck_user_id` em cliques de links Hotmart/Kiwify/Eduzz/WhatsApp/checkout

As rotas `/api/identify`, `/api/event` e `/api/lead` respondem com CORS (`Access-Control-Allow-Origin: *`).

```js
window.trck.event("InitiateCheckout");
window.trck.identify({ email: "a@b.com", phone: "5511..." });
window.trck.lead({ fields: { email: "a@b.com" }, form_label: "Newsletter" });
```

Para ignorar um form: `data-trck-ignore` no `<form>`.

## Eventos manuais (botões)

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
<script>
  document.getElementById("btn-comprar")?.addEventListener("click", function () {
    window.trck?.event("InitiateCheckout");
  });
</script>
```

## Marcar um link específico

```html
<a href="https://pay.hotmart.com/XXXX" class="trck-link">Comprar</a>
<!-- ou -->
<a href="https://wa.me/5511999999999" data-trck>WhatsApp</a>
```

## Webhook (NÃO vai no site)

Na Hotmart/Kiwify/Eduzz — Integrações → plataforma → Adicionar integração:

```txt
URL: https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <secret da conexão>
```

## Depois do deploy

O arquivo fica em `https://SEU_DOMINIO/snippet.js` (domínio da stack instalada).
