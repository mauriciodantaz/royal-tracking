# Autenticação de webhooks inbound

Toda conexão inbound autentica o POST. Sem credencial válida → `401 unauthorized`. Payload > 1 MiB → `413`.

## URLs

| Forma | URL | Uso |
|-------|-----|-----|
| Curta (preferida) | `POST https://SEU_DOMINIO/api/w/{slug}` | UI, registros automáticos (RD, Pipedrive, WhatsApp) |
| Legada | `POST https://SEU_DOMINIO/api/webhook/in/{connectionId}` | Marketplaces / configs manuais antigas |

As duas passam pela **mesma** checagem de auth.

## Por provedor

| Provedor | Como autenticar | Quem configura |
|----------|-----------------|----------------|
| Hotmart, Kiwify, Eduzz | Token = campo **Webhook token** da conexão. Aceito em: header `x-webhook-token`, `Authorization: Bearer …`, query `?token=`, ou body `hottok` / `token` | Você cola URL + token no painel do marketplace |
| RD Station CRM | Header `x-webhook-token` (registrado pela stack) | Automático após OAuth |
| RD Station Marketing | Novos webhooks: URL com `?token=…`. Legado sem query: aceito pelo slug secreto | Automático; re-sincronize funis se precisar renovar |
| Pipedrive | HTTP Basic: user `royal-tracking`, password = secret da conexão | Automático após OAuth |
| Evolution API / UazAPI | Header `x-webhook-token` (registrado pela stack) | Automático ao salvar / **Reconfigurar webhook** |
| RD Conversas (Tallos) | Só a URL curta (slug secreto). Tallos não envia header custom | Você cola a URL no Tallos — **não compartilhe** a URL |

## Marketplaces — exemplos

URL longa + header (recomendado quando o painel do marketplace permitir headers):

```txt
https://SEU_DOMINIO/api/webhook/in/{connectionId}
Header: x-webhook-token: <mesmo Webhook token da conexão>
```

URL curta + query (quando só dá para colar URL):

```txt
https://SEU_DOMINIO/api/w/{slug}?token=<mesmo Webhook token da conexão>
```

Hotmart também pode enviar o segredo como **hottok** no body — desde que o valor seja idêntico ao da conexão.

## Após atualizar a stack (migração)

Se a connection já existia **antes** do harden de webhooks:

1. **Hotmart / Kiwify / Eduzz** com URL curta **sem** `?token=` → passam a receber `401`. Acrescente `?token=` ou use a URL longa + header.
2. Demais providers com registro automático (RD CRM, Pipedrive, Evolution, UazAPI) → em geral **nada a fazer**.
3. RD Conversas → nada a fazer (auth = URL).
4. RD Marketing legado (URL sem token) → continua aceito; webhooks novos já saem com `?token=`.

Token/secret da conexão: painel **Integrações → [plataforma]** (campo Webhook token, ou o secret gerado pela stack para CRM/WhatsApp).

## Relacionado

- Visão do hub: [INTEGRATIONS.md](./INTEGRATIONS.md)
- Checklist de segurança: [SECURITY.md](../SECURITY.md)
- Guias por plataforma: [integrations/](./integrations/)
