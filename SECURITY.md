# Auditoria de segurança — Royal Tracking

Checklist verificado no código (revisar de novo a cada release):

## Segredos e env

- [x] `.env` no `.gitignore` — nunca commitado
- [x] `.env.example` só com placeholders
- [x] `SUPABASE_SERVICE_ROLE_KEY` e `ENCRYPTION_KEY` sem `NEXT_PUBLIC_`
- [x] Tokens Meta/GA4/Ads no Postgres (pgcrypto), não em env
- [x] `createAdminClient` em `server-only` (`src/lib/supabase/admin.ts`)
- [x] Decrypt só no servidor (`src/lib/crypto/secrets.ts`)

## Auth / RLS

- [x] Policies SELECT para `authenticated` nas tabelas de leitura do painel
- [x] `settings` **sem** SELECT autenticado (webhook_token só service_role); view `settings_public` sem o token
- [x] Sem policies de INSERT/UPDATE/DELETE para anon/authenticated (escrita via service_role)
- [x] `REVOKE` de anon/public nas tabelas de tracking
- [ ] **Manual:** Dashboard Auth → desligar “Allow new users to sign up”
- [x] Proxy protege `/dashboard/*` (redirect login)
- [x] UI de login sem signup

## Endpoints públicos

- [x] `/api/identify` — Zod + rate limit por IP
- [x] `/api/event` — Zod + rate limit; CAPI server-side
- [x] `/api/webhook/compra` — token (`x-webhook-token` / Bearer / `?token=`) com comparação timing-safe
- [x] `/api/ga4/ids` — só measurement_ids públicos (sem api_secret)

## Retenção

- [x] `purge_old_event_payloads` + pg_cron diário (se extensão disponível)

## Deploy

- [x] Dockerfile multi-stage standalone
- [x] GH Actions build/push + SSH deploy (secrets: REGISTRY_*, VPS_*)
- [ ] Cadastrar URL do webhook na plataforma de venda:
  `https://SEU_DOMINIO/api/webhook/compra` + header `x-webhook-token`
