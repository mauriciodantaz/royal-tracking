# Royal Tracking

Sistema de tracking server-side self-hosted (Meta CAPI + GA4 + webhook de compra) com painel autenticado.

**Produção:** https://tracking.royalserver.com.br  
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
# Na VPS — naming automático royaltracking_<projeto>
./install.sh
```

O script pergunta o **nome da empresa/projeto** e cria stack, serviço, volume, DB e user como `royaltracking_<slug>`. Postgres fica na stack externa (`RoyalNet`).

Produção: ver [DEPLOY.md](./DEPLOY.md).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | Chave AES-GCM (≥16 chars) para tokens no banco |
| `AUTH_SECRET` | Secret Auth.js |
| `NEXTAUTH_URL` | URL pública (https://tracking.royalserver.com.br) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed do admin no primeiro boot |
| `NEXT_PUBLIC_APP_URL` | URL pública (snippet / links) |

## Snippet no site do cliente

```html
<script src="https://tracking.royalserver.com.br/snippet.js" async></script>
```

Docs: [docs/SNIPPET.md](./docs/SNIPPET.md)

## Webhook de compra

`POST https://tracking.royalserver.com.br/api/webhook/compra`  
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
- [DEPLOY.md](./DEPLOY.md) — Portainer / Swarm / Actions
- [SECURITY.md](./SECURITY.md) — checklist
- [docs/SELF-HOSTED.md](./docs/SELF-HOSTED.md) — uma stack por domínio
