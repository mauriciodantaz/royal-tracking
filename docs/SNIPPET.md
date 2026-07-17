# Royal Tracking — snippet no site do cliente

Use o domínio da **sua** instalação (uma stack por domínio-raiz). Produção: `tracking.royalgrowth.com.br`.

Com `ALLOWED_EVENT_DOMAINS=royalgrowth.com.br`, as APIs `/api/identify`, `/api/event`, `/api/lead`, `/api/ga4/ids` e `/api/meta/ids` só aceitam pedidos cujo `Origin`/`Referer` seja esse apex ou um subdomínio (`www.`, `lp.`, `mkt.`, …).

## Código para colar

No **`<head>`** (ou antes de `</body>`) de **todas** as páginas da landing/site:

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Só isso já:
- carrega Pixel Meta e gtag a partir das conexões ativas (`/api/meta/ids`, `/api/ga4/ids`)
- chama `/api/identify`
- dispara `PageView` no **browser** (`fbq` / `gtag`) e em `/api/event` com o **mesmo `event_id`**
- captura **submit de qualquer formulário** → web + `/api/lead`
- guarda `trck_user_id` (cookie + localStorage)
- anexa `trck_user_id` em cliques de links Hotmart/Kiwify/Eduzz/WhatsApp/checkout

### Web + server (dedup)

O padrão é o mesmo do Stape/GTM:

1. Snippet gera um `event_id` por ação.
2. Dispara Pixel/gtag no browser com esse ID (`eventID` / `event_id`).
3. Em paralelo, POST na API first-party com o mesmo ID → CAPI / Measurement Protocol.
4. Meta e Google deduplicam; o banco também (`events_log.event_id` unique).

Se o Pixel/gtag estiver bloqueado (adblock), o server continua. Se a API falhar, o web já disparou.

**Consent / LGPD:** o snippet não implementa CMP. As tags web seguem a política de consentimento do site.

As rotas públicas respondem com CORS: com allowlist, ecoam o `Origin` permitido; sem `ALLOWED_EVENT_DOMAINS`, usam `*`. Pixel/gtag continuam third-party (Meta/Google).

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

## Webhook de compra (só server)

Na Hotmart/Kiwify/Eduzz — Integrações → plataforma → Adicionar integração:

```txt
URL: https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <secret da conexão>
```

Compras via webhook **não** disparam Pixel/gtag no browser — entram como `ingest_path=webhook` / server-only no overview (não há página do checkout da plataforma no seu domínio).

## Depois do deploy

O arquivo fica em `https://SEU_DOMINIO/snippet.js` (domínio da stack instalada).

## Checklist de debug

1. **Meta Events Manager → Test events:** PageView/Lead com o mesmo `event_id` no browser e no CAPI (deduplicados).
2. **GA4 DebugView:** evento com parâmetro `event_id` igual ao da API / Measurement Protocol.
3. Bloquear `fbevents.js` no DevTools: API + CAPI ainda devem registrar o evento (`server_only` / `web_meta=false`).
4. Replay do mesmo `event_id` na API → `{ deduped: true }` sem segundo envio CAPI/MP.
