# Royal Tracking — CURSOR.md

Documentação viva do sistema de tracking server-side. Atualizar ao fim de cada fase.

## Stack

- **Next.js** 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Postgres** local (Docker Swarm) via `DB_POSTGRESDB_*` (padrão n8n) — single-tenant por stack
- **Auth.js** (credentials) + seed `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- **Deploy:** build na VPS (volume + Portainer/Swarm + Traefik); imagem Docker Hub pausada
- **Meta Graph API:** constante `META_GRAPH_API_VERSION` em `src/lib/meta/constants.ts` (atual: `v25.0`)
- **GA4:** gtag no browser; Measurement Protocol **somente** no webhook de compra

## Self-hosted — regras

- **NÃO usar** o MCP Supabase neste repo (conta errada / produto OSS não depende dele).
- Env obrigatórios: `DB_POSTGRESDB_*` (ou `DATABASE_URL` legado), `ENCRYPTION_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_*`.
- Env recomendado em produção: `ALLOWED_EVENT_DOMAINS` (apex da marca).
- Schema: `db/migrations/*.sql` (aplicado no boot do app).
- Uma stack por domínio-raiz = um Postgres + um admin + um `ENCRYPTION_KEY` + allowlist desse apex.

## Segurança

- Só o servidor Node fala com o DB (rede Docker interna).
- Painel protegido por sessão Auth.js (`/dashboard/*`).
- Endpoints públicos do snippet: Zod + rate limit + Origin/Referer no apex (`ALLOWED_EVENT_DOMAINS`); webhook exige token.
- Segredos de plataforma (tokens Meta/GA4) no Postgres, cifrados (AES-GCM em Node).
- Checklist: [SECURITY.md](./SECURITY.md)

## Como rodar

```bash
cp .env.example .env   # preencher DB_POSTGRESDB_*, ENCRYPTION_KEY, AUTH_SECRET, ADMIN_*
npm install --legacy-peer-deps
npm run dev
```

Quickstart Docker: [README.md](./README.md) · `./install.sh` · [DEPLOY.md](./DEPLOY.md)

### Deploy

Domínio de produção: **https://tracking.royalgrowth.com.br** (VPS, rede `RoyalNet`)  
Apex de eventos: **royalgrowth.com.br** (`ALLOWED_EVENT_DOMAINS`)  

Instância: `royaltracking_dev` · Postgres externo (host Swarm `postgres`)  
**Env na stack Portainer** (YAML); volume = build only.  
Imagem Hub: pausada — produção usa build no volume da VPS.
Guia: [DEPLOY.md](./DEPLOY.md)

### Webhook na plataforma de venda

URL: `https://SEU_DOMINIO/api/webhook/in/{connectionId}`  
Header: `x-webhook-token: <secret da conexão>` (ou `Authorization: Bearer …` / `?token=`)  
Criar a conexão em Integrações → Hotmart/Kiwify/Eduzz.

### Snippet no site

Ver [docs/integrations/snippet.md](./docs/integrations/snippet.md). URL relativa ao domínio instalado.
