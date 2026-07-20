# Site / Forms — snippet

O módulo **Site / Forms** não pede token. O snippet já está ativo na stack: você cola um script no site do cliente e os eventos entram como fonte `snippet`.

## O que o snippet faz

- Chama `/api/identify` e guarda `trck_user_id`
- Dispara **PageView** (web Pixel/gtag + server) com o mesmo `event_id`
- Captura submit de formulários → **Lead**
- Expõe `window.trck.event` / `identify` / `lead`
- Anexa `trck_user_id` em links de checkout/WhatsApp/Hotmart/etc.
- Em `wa.me` / `api.whatsapp.com`, coloca `[rt:código]` no final do `text=` (código curto do visitor; não altera o resto da mensagem)
- Captura `gclid` / `ttclid` e monta `fbc` a partir de `fbclid` quando o cookie `_fbc` não existir
- Helper: `trck.withWhatsAppTicket(url, message?)`

## Código para colar

No `<head>` (ou antes de `</body>`) de todas as páginas:

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Substitua `SEU_DOMINIO` pelo domínio desta instalação (ex.: `tracking.royalgrowth.com.br`).

Opcional, antes do script:

```html
<script>window.TRCK_ENDPOINT="https://SEU_DOMINIO";</script>
```

## Allowlist de origem

Se `ALLOWED_EVENT_DOMAINS` estiver definido no Portainer (ex.: `royalgrowth.com.br`), as APIs públicas só aceitam `Origin`/`Referer` desse apex e subdomínios.

Endpoints: `/api/identify`, `/api/event`, `/api/lead`, `/api/ga4/ids`, `/api/meta/ids`, `/api/tracking/config`.

## Web + server

Com Meta e/ou GA4 conectados:

1. Snippet gera um `event_id`
2. Dispara `fbq` / `gtag` no browser
3. POST na API first-party com o mesmo ID → CAPI / Measurement Protocol
4. Destinos deduplicam

Compras via **webhook** de marketplace (Hotmart etc.) **não** passam pelo snippet — são só server.

## Eventos manuais

```js
window.trck.event("InitiateCheckout");
window.trck.identify({ email: "a@b.com", phone: "5511..." });
window.trck.lead({ fields: { email: "a@b.com" }, form_label: "Newsletter" });
```

Ignorar um form: atributo `data-trck-ignore` no `<form>`.

## Moeda padrão

Na página **Site / Forms** do painel você pode definir a moeda padrão (`BRL`, etc.) usada quando webhooks de compra não enviam `currency`.

## Checklist de debug

1. Network: `fbq`/`gtag` e `POST /api/event` com o mesmo `event_id`
2. Meta Test Events / GA4 DebugView
3. Bloquear `fbevents.js`: server ainda deve registrar o evento
4. Replay do mesmo `event_id` → `{ deduped: true }`

## Docs relacionadas

- [SNIPPET.md](../SNIPPET.md) — referência completa
- [INTEGRATIONS.md](../INTEGRATIONS.md) — hub de integrações
