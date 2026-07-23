# Checklist de atribuição (4 trilhas)

Use este plano para validar o tracking após deploy. Em cada trilha, registre: URL de aterrissagem, cookies/IDs, mensagem/webhook, origem no painel, estágio CRM (se houver) e delivery log Meta/GA4/Google Ads.

O **painel Royal Tracking** é a verdade operacional. Ads Manager pode não atribuir mesmo com CAPI/upload ok — veja [INTEGRATIONS.md](./INTEGRATIONS.md#verdade-operacional-vs-ads-manager).

## 1. Meta → site → WhatsApp

1. Anúncio Meta com UTMs + `fbclid` apontando para landing com snippet.
2. Clique → Network: `POST /api/identify` com `fbc`/`fbp`.
3. Clique no CTA `wa.me` → mensagem com `[rt:…]`.
4. Envie a mensagem (não apague o ticket).
5. Webhook Evolution/UazAPI/RD Conversas → Lead com badge **ticket**.
6. CAPI Lead com `action_source: website` + `fbc`/`fbp`.

## 2. Google → site → WhatsApp

1. Anúncio Google com auto-tagging (`gclid`) + UTMs.
2. Identify persiste `gclid` (e `wbraid`/`gbraid` se mobile app).
3. WhatsApp com ticket → Lead matched.
4. Avance estágio CRM mapeado **ou** dispare Purchase → Google Ads `UploadClickConversions` em `integration_delivery_log` (`ok` ou `skipped` se sem gclid).

## 3. Meta Click-to-WhatsApp (CTWA)

1. Anúncio CTWA (mensagem) no número integrado.
2. Usuário inicia conversa; webhook deve trazer `referral.ctwa_clid` (quando o provedor repassar).
3. Lead criado **sem** ticket, badge **ctwa**.
4. CAPI com `action_source: business_messaging` + `messaging_channel: whatsapp` + `ctwa_clid`.
5. Se o provedor **não** enviar referral: use mensagem com ticket ou [link `/r/{slug}`](./integrations/snippet.md) + fluxo site.

## 4. Orgânico / direto

1. Abra o site sem UTMs/click IDs.
2. WhatsApp com ticket → Lead matched, sem gclid/ctwa.
3. Confirme que não polui Ads com upload sem click ID (`missing_click_id` = skipped).

## 5. WhatsApp sem `[rt:…]` (lead apagou o ticket)

1. Landing com snippet → identify grava visitor + telefone (se houver form) **ou** só sessão web.
2. Usuário abre `wa.me`, **apaga** a linha `[rt:…]` e envia a mensagem.
3. Webhook deve criar Lead mesmo assim:
   - Se o telefone já existir em `visitors` → badge **phone** (atribuição do visitor).
   - Se for a 1ª vez desse telefone na base → badge **organic**, Lead só com dados da plataforma (telefone, push name).
4. Segunda mensagem do mesmo telefone sem ticket **não** gera outro Lead CAPI.
5. Conversão (Purchase / estágio CRM) dentro de 30 dias da `first_lead_at` usa first-touch (`ft_*`).

## Consentimento (CMP)

```html
<script>
  window.TRCK_CONSENT = false; // até o usuário aceitar cookies de marketing
</script>
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Quando o CMP aceitar: `window.TRCK_CONSENT = true` e, se quiser, chame `trck.identify()` de novo. Default sem `TRCK_CONSENT` = comportamento legado (consent true). Cookies de marketing devem ficar off por padrão quando a base legal for consentimento (ANPD).
