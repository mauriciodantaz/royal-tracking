# Auditoria de segurança — Royal Tracking

Checklist verificado no código (revisar de novo a cada release):

## Segredos e env

- [x] `.env` no `.gitignore` — nunca commitado
- [x] `.env.example` só com placeholders
- [x] `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `ADMIN_PASSWORD`, `SMTP_PASS` sem `NEXT_PUBLIC_`
- [x] Tokens Meta/GA4/Ads no Postgres (AES-GCM), não em env
- [x] Pool Postgres e crypto em `server-only`
- [x] Decrypt só no servidor (`src/lib/crypto/secrets.ts`)

## Auth

- [x] Auth.js credentials + JWT session
- [x] Super admin sync a cada boot (`ADMIN_EMAIL` / `ADMIN_PASSWORD`); imutável na UI
- [x] Gestores convidados por e-mail (SMTP da stack); sem signup público
- [x] Reset de senha só para gestores (não para super admin da stack)
- [x] Proxy protege `/dashboard/*` (redirect login)
- [x] Logout no painel

## Endpoints públicos

- [x] `/api/identify` — Zod + rate limit por IP + allowlist de Origin/Referer (`ALLOWED_EVENT_DOMAINS`)
- [x] `/api/event` — Zod + rate limit + allowlist; CAPI server-side
- [x] `/api/lead` — Zod + rate limit + allowlist
- [x] `/api/webhook/in/[connectionId]` — secret por conexão (`x-webhook-token` / Bearer / `?token=`) com comparação timing-safe
- [x] `/api/ga4/ids` — só measurement_ids públicos (sem api_secret) + allowlist
- [x] Matching de apex: host exato ou `*.apex` (não aceita sufixo colado tipo `evilroyalgrowth.com.br`)

## Retenção

- [x] `purge_old_event_payloads` no schema (agendar via cron externo se desejado)

## Deploy

- [x] Dockerfile multi-stage standalone (+ `db/migrations`)
- [ ] GH Actions build/push Docker Hub (pausado — deploy atual é build na VPS)
- [x] Stack Portainer de referência sem secrets reais
- [ ] Cadastrar URL do webhook na plataforma de venda (Integrações):
  `https://SEU_DOMINIO/api/webhook/in/{connectionId}` + header `x-webhook-token`
