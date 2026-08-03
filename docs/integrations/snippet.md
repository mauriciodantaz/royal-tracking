# Site / Forms — snippet

O módulo **Site / Forms** não pede token. O snippet já está ativo na stack: você cola um script no site do cliente e os eventos entram como fonte `snippet`.

## O que o snippet faz

- Chama `/api/identify` e guarda `trck_user_id`
- Dispara **PageView** (web Pixel/gtag + server) com o mesmo `event_id`
- Captura submit de formulários → **Lead** **somente quando o payload tem email ou telefone** (classificação multi-sinal). Busca, quantidade, CEP etc. não viram form/lead
- Formulários iguais em páginas diferentes (ecommerce) compartilham o mesmo fingerprint (`action` efetivo + label + campos; URL da página não entra)
- Auto ecommerce `search`: só dispara se a query tiver termo (`q` / `s` / `search` / `palavra_busca`)
- Envia `canonical_url` (UTMs/click IDs removidos) além de `event_source_url` cru para CAPI
- SPA: escuta `pushState` / `replaceState` / `popstate` / `hashchange` com dedupe ~800ms
- Painel **Regras**: exceções e eventos extras por URL, além dos opt-ins “funil de loja” e “dataLayer”. Exclusões built-in (`wp-admin`, logout, preview) já vêm ativas via `/api/tracking/config`
- Expõe `window.trck.event` / `identify` / `lead` / `canonicalUrl` / `getConfig`
- Anexa `trck_user_id` em links de checkout/WhatsApp/Hotmart/etc.
- Em `wa.me` / `api.whatsapp.com`, coloca `[rt:código]` no final do `text=` (código curto do visitor; não altera o resto da mensagem)
- Captura `gclid` / `ttclid` / `wbraid` / `gbraid` e monta `fbc` a partir de `fbclid` quando o cookie `_fbc` não existir
- Helper: `trck.withWhatsAppTicket(url, message?)`
- Preenche campos hidden convencionais com o ticket (`trck.fillTrackingFields`) — útil no redirect do Elementor
- Consentimento CMP: `window.TRCK_CONSENT` (boolean). Default `true` (legado). Se `false`, não envia click IDs / `fbp`/`fbc` e grava `consent: false` no Lead. Veja [ATTRIBUTION-CHECKLIST.md](../ATTRIBUTION-CHECKLIST.md).
- Links first-party: painel **Links** → `/r/{slug}` (captura visitor + ticket e abre WhatsApp)

## Código para colar

No `<head>` (ou antes de `</body>`) de todas as páginas:

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Substitua `SEU_DOMINIO` pelo domínio desta instalação (ex.: `tracking.royalgrowth.com.br`).

O snippet resolve o endpoint automaticamente pela origem do `src` do script. Se não conseguir resolver (e sem `TRCK_ENDPOINT`), ele **não envia** eventos (fail-closed). Só use override se o host da API for outro:

```html
<script>window.TRCK_ENDPOINT="https://SEU_DOMINIO";</script>
```

## Allowlist de origem

Em produção, `ALLOWED_EVENT_DOMAINS` é **obrigatório** (boot falha se faltar ou for placeholder). Ex.: `cliente.com.br` — as APIs públicas só aceitam `Origin`/`Referer` desse apex e subdomínios (**fail-closed** se a lista estiver vazia em produção). Tem que ser o **apex do site onde o snippet roda**, não o host do painel.

Endpoints (com rate limit por IP): `/api/identify`, `/api/event`, `/api/lead`, `/api/ga4/ids`, `/api/meta/ids`, `/api/tracking/config`. Redirects `/r/{slug}` também têm rate limit.

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

## Elementor popup → redirect WhatsApp

O redirect “After Submit” do Elementor **não** passa pelo clique em `<a>`, então o patch automático de `wa.me` não roda. Use um **campo Hidden** + shortcode na URL de redirect.

1. No formulário do popup, adicione um campo **Hidden** com ID `rt_ticket` (deixe o valor vazio).
2. Action **Redirect** — o ticket precisa ir **dentro de `text=`** (WhatsApp ignora outros query params na mensagem):

```text
https://wa.me/5511999999999?text=Olá! Quero saber mais [field id="rt_ticket"]
```

3. O snippet preenche o hidden com `[rt:código]` (após identify, no submit e quando o popup abre).

Campos reconhecidos: `rt_ticket`, `trck_ticket`, `form_fields[rt_ticket]` (Elementor), `data-trck="ticket"`, classe `trck-ticket`.

### Alternativa: link first-party `/r/{slug}`

Hidden com ID `trck_user_id` + redirect:

```text
https://SEU_DOMINIO/r/SLUG?trck_user_id=[field id="trck_user_id"]
```

O `/r/{slug}` monta o `wa.me` com o ticket na mensagem.

### Checklist

1. Abrir o popup → inspecionar o hidden: valor `[rt:…]`
2. Submit → URL do WhatsApp contém `[rt:…]` no `text=`
3. Webhook casa o visitor pelo ticket

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
