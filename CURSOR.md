# Royal Tracking — CURSOR.md

Documentação viva do sistema de tracking server-side. Atualizar ao fim de cada fase.

## Stack

- **Next.js** 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Postgres** local (Docker Swarm) via `DATABASE_URL` — single-tenant por stack
- **Auth.js** (credentials) + seed `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- **Deploy:** imagem Docker Hub + Portainer/Swarm + Traefik (não Vercel)
- **Meta Graph API:** constante `META_GRAPH_API_VERSION` em `src/lib/meta/constants.ts` (atual: `v25.0`)
- **GA4:** gtag no browser; Measurement Protocol **somente** no webhook de compra

## Self-hosted — regras

- **NÃO usar** o MCP Supabase neste repo (conta errada / produto OSS não depende dele).
- Env obrigatórios: `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_*`.
- Schema: `db/migrations/*.sql` (aplicado no boot). Histórico antigo em `supabase/migrations/` só referência.
- Uma stack por domínio = um Postgres + um admin + um `ENCRYPTION_KEY`.

## Segurança

- Só o servidor Node fala com o DB (rede Docker interna).
- Painel protegido por sessão Auth.js (`/dashboard/*`).
- Endpoints públicos: validação + rate limit; webhook exige token.
- Segredos de plataforma (tokens Meta/GA4) no Postgres, cifrados (AES-GCM em Node).
- Checklist: [SECURITY.md](./SECURITY.md)

## Como rodar

```bash
cp .env.example .env   # preencher DATABASE_URL, ENCRYPTION_KEY, AUTH_SECRET, ADMIN_*
npm install --legacy-peer-deps
npm run dev
```

Quickstart Docker: [README.md](./README.md) · `./install.sh` · [DEPLOY.md](./DEPLOY.md)

### Deploy

Domínio de produção: **https://tracking.royalserver.com.br** (VPS RoyalServer, rede `RoyalNet`)  
Instância: `royaltracking_dev` · Postgres externo (host Swarm `postgres`)  
**Env na stack Portainer** (YAML); volume = build only.  
Imagem (opcional): `royalserver/royal-tracking`  
Guia: [DEPLOY.md](./DEPLOY.md)

### Webhook na plataforma de venda

URL: `https://SEU_DOMINIO/api/webhook/in/{connectionId}`  
Header: `x-webhook-token: <secret da conexão>` (ou `Authorization: Bearer …` / `?token=`)  
Criar a conexão em Integrações → Hotmart/Kiwify/Eduzz.

### Snippet no site

Ver [docs/SNIPPET.md](./docs/SNIPPET.md). URL relativa ao domínio instalado.
