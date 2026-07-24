# Auditoria de segurança — Royal Tracking

Checklist verificado no código (revisar de novo a cada release).

## Modelo de isolamento

- **Single-stack:** uma instalação = um Postgres = um cliente. Gestores da mesma stack veem todos os recursos da instância (intencional).
- Isolamento entre clientes = stacks/bancos/env separados (ver [docs/SELF-HOSTED.md](docs/SELF-HOSTED.md)).
- **Não** há `tenant_id` / RLS / multi-tenant no app OSS.
- Cloud futura prevista como **SaaS agregador de várias stacks single** (outro produto) — não implica tenancy neste repositório.

## Pré-PR (obrigatório)

- [ ] Erros ao cliente são genéricos (sem stack/SQL/paths/`err.message` interno)?
- [ ] Webhooks inbound autenticam (token/Basic; RD Conversas = URL secreta)?
- [ ] URLs configuráveis (Evolution/UazAPI) passam por SSRF check (HTTPS + bloquear privados)?
- [ ] Login/reset e APIs públicas têm rate limit?
- [ ] Secrets só server-side / AES-GCM / sem `NEXT_PUBLIC_`?
- [ ] Sessão revalida `users.active` + `role` no banco?
- [ ] Logs sem tokens/Authorization/Cookie; PII mascarada quando logada?

## Segredos e env

- [x] `.env` no `.gitignore` — nunca commitado
- [x] `.env.example` só com placeholders
- [x] `DB_POSTGRESDB_PASSWORD` / `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `ADMIN_PASSWORD`, `SMTP_PASS` sem `NEXT_PUBLIC_`
- [x] Tokens Meta/GA4/Ads/webhooks no Postgres (AES-GCM), não em env
- [x] Pool Postgres e crypto em `server-only`
- [x] Decrypt só no servidor (`src/lib/crypto/secrets.ts`)
- [x] Produção: boot falha se `ALLOWED_EVENT_DOMAINS` / secrets forem placeholder (`assertRuntimeEnv`)

## Auth e autorização

- [x] Auth.js credentials + JWT session
- [x] `requireUser()` revalida usuário ativo e papel no DB
- [x] RBAC via `requirePermission` (`super_admin` vs `manager`)
- [x] Super admin sync a cada boot (`ADMIN_EMAIL` / `ADMIN_PASSWORD`); imutável na UI
- [x] Gestores convidados por e-mail; sem signup público
- [x] Reset de senha: mensagem neutra (anti-enumeração, inclusive para ADMIN_EMAIL)
- [x] Rate limit em login e esqueci-senha
- [x] Proxy protege `/dashboard/*`

## Endpoints públicos

- [x] `/api/identify`, `/api/event`, `/api/lead` — Zod + rate limit + allowlist
- [x] Produção fail-closed se allowlist vazia
- [x] `/api/webhook/in/[connectionId]` e `/api/w/[slug]` — auth por provider + limite de body
  - Pipedrive: HTTP Basic; marketplaces/CRM/WhatsApp Evolution-UazAPI: token; RD Conversas / RD MKT legado: slug secreto (MKT novo registra `?token=`)
- [x] `/api/ga4/ids`, `/api/meta/ids`, `/api/tracking/config`, `/r/[slug]` — rate limit + allowlist onde aplicável
- [x] Respostas 500 sem `err.message` interno

## SSRF / egress

- [x] Evolution / UazAPI: `assertSafeOutboundUrl` + timeout em `safeFetch`

## Headers

- [x] CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors` / X-Frame-Options (`next.config.ts`)

## Auditoria e deps

- [x] Tabela `audit_events` para ações admin sensíveis
- [x] CI `npm audit --omit=dev --audit-level=high` + Dependabot
- [x] Redaction helper `redactForLog`

## Rate limit

- [x] Em memória (adequado a 1 réplica Swarm). Com múltiplas réplicas o limite não é global — documentado; trocar implementação em `src/lib/rate-limit` se escalar.

## Retenção

- [x] `purge_old_event_payloads` no schema (agendar via cron externo se desejado)

## Deploy / ops

- [x] Dockerfile multi-stage standalone (+ `db/migrations`)
- [x] Stack Portainer de referência sem secrets reais
- [x] Docs alinhadas: [WEBHOOK-AUTH.md](docs/WEBHOOK-AUTH.md), [SELF-HOSTED.md](docs/SELF-HOSTED.md), guias em `docs/integrations/`
- [ ] Por instalação: `ALLOWED_EVENT_DOMAINS` = apex do site (não o host do painel)
- [ ] Por instalação: cadastrar webhooks com auth correta (marketplaces = token; ver WEBHOOK-AUTH)

## Documentação relacionada

| Doc | Conteúdo |
|-----|----------|
| [docs/WEBHOOK-AUTH.md](docs/WEBHOOK-AUTH.md) | Auth inbound por provider + migração |
| [docs/SELF-HOSTED.md](docs/SELF-HOSTED.md) | Single-stack, allowlist, rate limit, SSRF |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Hub + tabela de auth |
| [docs/integrations/](docs/integrations/) | Guias por plataforma (painel) |
