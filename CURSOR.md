# Tracking — CURSOR.md

Documentação viva do sistema de tracking server-side. Atualizar ao fim de cada fase.

## Stack

- **Next.js** 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Supabase** (Postgres + Auth) — projeto `tdgaitwvakzztcbodwfm`
- **Deploy:** VPS + Docker + GitHub Actions (não Vercel)
- **Meta Graph API:** constante `META_GRAPH_API_VERSION` em `src/lib/meta/constants.ts` (atual: `v25.0`)
- **GA4:** gtag no browser; Measurement Protocol **somente** no webhook de compra

## Supabase — regras obrigatórias

- **NÃO usar** o MCP `plugin-supabase-supabase` neste repo (autenticado em outra conta/org).
- Credenciais **somente** do `.env` local:
  - `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` = `https://tdgaitwvakzztcbodwfm.supabase.co`
  - `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` e `ENCRYPTION_KEY` — só backend (nunca `NEXT_PUBLIC_`)
- Schema/SQL/migrations: CLI (`npx supabase ...`), SQL Editor no Dashboard, ou scripts com `.env`.
- Nunca assumir que `list_projects` / `get_project` do MCP apontam para este projeto.

## Segurança

- RLS em todas as tabelas: leitura autenticada; escrita só `service_role` no servidor.
- Cadastro público desligado.
- Endpoints públicos: validação + rate limit; webhook exige token.
- Segredos de plataforma (tokens Meta/GA4) no Postgres, cifrados (pgcrypto).

## Fases

| Fase | Status | Entrega |
|------|--------|---------|
| 0 | concluída | Scaffold + design system + Docker/CI stub |
| 1 | concluída | Schema, RLS, crypto, clients; migration pronta (aplicar no Dashboard) |
| 2 | pendente | `/api/identify` + `/api/event` + Meta CAPI |
| 3 | pendente | Webhook compra + GA4 MP |
| 4 | pendente | Painel auth + CRUD multi-conta |
| 5 | pendente | Dashboard + gtag dinâmica |
| 6 | pendente | Campanhas Ads + geo + retenção |
| 7 | pendente | Auditoria + deploy VPS |

## Como rodar

```bash
cp .env.example .env   # preencher keys (incl. NEXT_PUBLIC_* espelhando URL/anon)
npm install
npm run dev
```

### Aplicar migration (Fase 1)

O CLI logado neste ambiente **não** vê o projeto `tdgaitwvakzztcbodwfm`. Opções:

1. **SQL Editor** (recomendado): cole `supabase/migrations/20260709120000_init_tracking.sql` no Dashboard do projeto.
2. Token da conta certa: `SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs`
3. `npx supabase link --project-ref tdgaitwvakzztcbodwfm` (login na conta dona) + `npx supabase db push`

No Dashboard → Authentication → Providers: **desligar** signup público / “Allow new users to sign up”.

Preencher no `.env` (local, não commitado): `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, e espelhar URL/anon em `NEXT_PUBLIC_*`.

Build Docker local:

```bash
docker compose up --build
```

## Design system

- Tema escuro default + toggle claro
- Primária verde-neon HSL: escuro `142 76% 58%` / claro `142 70% 26%`
- Accents: ciano e âmbar; radius `0.625rem`
- Fontes: Manrope (texto), JetBrains Mono (números/JSON); tabular-nums
