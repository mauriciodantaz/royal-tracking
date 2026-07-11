# Auditoria de segurança — Royal Tracking

Checklist verificado no código (revisar de novo a cada release):

## Segredos e env

- [x] `.env` no `.gitignore` — nunca commitado
- [x] `.env.example` só com placeholders
- [x] `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `ADMIN_PASSWORD` sem `NEXT_PUBLIC_`
- [x] Tokens Meta/GA4/Ads no Postgres (AES-GCM), não em env
- [x] Pool Postgres e crypto em `server-only`
- [x] Decrypt só no servidor (`src/lib/crypto/secrets.ts`)

## Auth

- [x] Auth.js credentials + JWT session
- [x] Admin seed só no primeiro boot (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- [x] Sem signup público na UI
- [x] Proxy protege `/dashboard/*` (redirect login)
- [x] Logout no painel

## Endpoints públicos

- [x] `/api/identify` — Zod + rate limit por IP
- [x] `/api/event` — Zod + rate limit; CAPI server-side
- [x] `/api/webhook/in/[connectionId]` — secret por conexão (`x-webhook-token` / Bearer / `?token=`) com comparação timing-safe
- [x] `/api/ga4/ids` — só measurement_ids públicos (sem api_secret)

## Retenção

- [x] `purge_old_event_payloads` no schema (agendar via cron externo se desejado)

## Deploy

- [x] Dockerfile multi-stage standalone (+ `db/migrations`)
- [x] GH Actions build/push Docker Hub
- [x] Stack Portainer de referência sem secrets reais
- [ ] Cadastrar URL do webhook na plataforma de venda (Integrações):
  `https://SEU_DOMINIO/api/webhook/in/{connectionId}` + header `x-webhook-token`
