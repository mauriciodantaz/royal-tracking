# Royal Tracking

Sistema de tracking server-side self-hosted (Meta CAPI + GA4 + webhook de compra) com painel autenticado.

**Produção:** https://tracking.royalgrowth.com.br  
**Licença:** MIT · Deploy: build na VPS (imagem Docker Hub pausada por enquanto)

Uma stack por domínio-raiz (apex) = um Postgres + um admin + um `ENCRYPTION_KEY` + allowlist de eventos desse apex (modelo n8n).

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

O script pergunta o **nome da empresa/projeto** e cria stack, serviço, volume, DB e user como `royaltracking_<slug>`. Postgres fica na stack externa (`RoyalNet`). **Env vai no YAML da stack Portainer** (não no volume).

Produção: ver [DEPLOY.md](./DEPLOY.md).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | Chave AES-GCM (≥16 chars) para tokens no banco |
| `AUTH_SECRET` | Secret Auth.js |
| `NEXTAUTH_URL` | URL pública (https://tracking.royalgrowth.com.br) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed do admin no primeiro boot |
| `NEXT_PUBLIC_APP_URL` | URL pública (snippet / links) |
| `ALLOWED_EVENT_DOMAINS` | Apex da marca (ex.: `royalgrowth.com.br`) — aceita esse host e qualquer subdomínio nas APIs do snippet |

## Snippet no site do cliente

```html
<script src="https://tracking.royalgrowth.com.br/snippet.js" async></script>
```

Docs: [docs/SNIPPET.md](./docs/SNIPPET.md)

## Webhook de compra

Por conexão em Integrações (Hotmart/Kiwify/Eduzz):

`POST https://tracking.royalgrowth.com.br/api/webhook/in/{connectionId}`  
Header: `x-webhook-token: <secret da conexão>`

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
