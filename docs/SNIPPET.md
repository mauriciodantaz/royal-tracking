# Royal Tracking — snippet no site do cliente

## Código para colar

No **`<head>`** (ou antes de `</body>`) de **todas** as páginas da landing/site:

```html
<script src="https://tracking.fizzing.marketing/snippet.js" async></script>
```

Só isso já:
- chama `/api/identify`
- dispara `PageView` em `/api/event`
- guarda `trck_user_id` (cookie + localStorage)
- anexa `trck_user_id` em cliques de links Hotmart/Kiwify/Eduzz/WhatsApp/checkout

## Eventos manuais (botões)

```html
<script src="https://tracking.fizzing.marketing/snippet.js" async></script>
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

Na Hotmart/Kiwify/Eduzz:

```txt
URL: https://tracking.fizzing.marketing/api/webhook/compra
Header: x-webhook-token: <token em Configuração no painel>
```

## Depois do deploy

O arquivo fica em:

```txt
https://tracking.fizzing.marketing/snippet.js
```

(precisa de um `git push` para publicar esta versão)
