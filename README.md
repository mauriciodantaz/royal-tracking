# Royal Tracking

Sistema de tracking server-side self-hosted (Meta CAPI + GA4 + webhook de compra) com painel autenticado.

**Licença:** MIT · **Imagem:** [`royalserver/royal-tracking`](https://hub.docker.com/r/royalserver/royal-tracking)

Uma stack por domínio = um Postgres + um admin + um `ENCRYPTION_KEY` (modelo n8n).

## Quickstart (Docker Compose)

```bash
git clone https://github.com/mauriciodantaz/tracking.git
cd tracking
cp .env.example .env   # ou use o docker-compose.yml (já traz Postgres + env de exemplo)
docker compose up -d --build
```

Abra http://localhost:3000 → login `admin@localhost` / `admin123456` (só no compose de exemplo).

## Quickstart (VPS / Swarm + Traefik)

```bash
# Na VPS (Docker Swarm + Traefik já rodando)
bash install.sh
```

O script pergunta domínio, senhas, gera secrets, sobe Postgres + app e imprime URL do snippet/webhook.

Stack de referência (placeholders): [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml)

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | Chave AES-GCM (≥16 chars) para tokens no banco |
| `AUTH_SECRET` | Secret Auth.js |
| `NEXTAUTH_URL` | URL pública (https://seu.dominio) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed do admin no primeiro boot |
| `NEXT_PUBLIC_APP_URL` | URL pública (snippet / links) |

## Snippet no site do cliente

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Docs: [docs/SNIPPET.md](./docs/SNIPPET.md)

## Webhook de compra

`POST https://SEU_DOMINIO/api/webhook/compra`  
Header: `x-webhook-token: <token do painel>`

## Dev local (sem Docker)

```bash
# Postgres rodando + DATABASE_URL no .env
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

Migrations em `db/migrations/` aplicam sozinhas no boot.

## Docs

- [CURSOR.md](./CURSOR.md) — arquitetura
- [DEPLOY.md](./DEPLOY.md) — Portainer / Swarm
- [SECURITY.md](./SECURITY.md) — checklist
- [docs/SELF-HOSTED.md](./docs/SELF-HOSTED.md) — uma stack por domínio
