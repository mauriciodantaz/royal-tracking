# Royal Tracking

Sistema de tracking server-side self-hosted (Meta CAPI + GA4 + webhook de compra) com painel autenticado.

**Licença:** [MIT](./LICENSE)  
**Imagem:** [`mauriciodantaz/royal-tracking`](https://hub.docker.com/r/mauriciodantaz/royal-tracking) (`:latest` = `:stable` · `:beta` · `:X.Y.Z`)  
**Demo:** https://tracking.royalgrowth.com.br

Uma stack por domínio-raiz (apex) = um Postgres + um admin + um `ENCRYPTION_KEY` + allowlist de eventos desse apex.

## Quickstart (Portainer / Swarm)

1. Tenha Postgres acessível na mesma rede Docker/Swarm (ex.: `RoyalNet`) e um hostname no Traefik.
2. Copie [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml), substitua os placeholders (`<SLUG>`, `<DOMAIN>`, senhas, etc.).
3. No Portainer → Stacks → Add stack → cole o YAML → Deploy.
4. Tags: `:latest` / `:stable` (produção), `:beta` (pré-release), ou pin `:X.Y.Z` / `:X.Y.Z-beta` (só enquanto não promovida).
   O painel mostra a versão/canal no rodapé da sidebar (e quantas SemVer o deploy está atrás no mesmo canal).

Atualizar:

```bash
docker service update --image mauriciodantaz/royal-tracking:latest royaltracking_<slug>_app
```

Instalação guiada na VPS: `bash install.sh` (padrão: puxa a imagem Hub; `ROYAL_TRACKING_BUILD_ON_VPS=1` só se quiser build local).

Detalhes: [docs/SELF-HOSTED.md](./docs/SELF-HOSTED.md) · [DEPLOY.md](./DEPLOY.md)

## Quickstart (Docker Compose — local)

```bash
git clone https://github.com/mauriciodantaz/royal-tracking.git
cd royal-tracking
docker compose up -d --build
```

Abra http://localhost:3000 → login `admin@localhost` / `admin123456` (só no compose de exemplo).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `PROJECT_NAME` | Nome da instância (título HTML: `{PROJECT_NAME} \| Royal Tracking`; stack = `royaltracking_<slug>`) |
| `DB_POSTGRESDB_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` | Postgres (padrão n8n; externo na rede) |
| `DATABASE_URL` | Fallback legado (só se as vars `DB_POSTGRESDB_*` não existirem) |
| `ENCRYPTION_KEY` | Chave AES-GCM (≥16 chars) para tokens no banco (também HMAC do FPID GA4) |
| `AUTH_SECRET` | Secret Auth.js |
| `NEXTAUTH_URL` | URL pública da instância |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Super admin imutável (sync a cada boot; senha só na stack) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP para convite, reset e alertas |
| `NEXT_PUBLIC_APP_URL` | URL pública (snippet / links) |
| `ALLOWED_EVENT_DOMAINS` | Apex do site (ex.: `exemplo.com.br`) — obrigatório em produção; aceita esse host e subdomínios |

Lista completa com placeholders: [`.env.example`](./.env.example) e a stack Portainer acima.

## Snippet no site do cliente

```html
<script src="https://SEU_DOMINIO/snippet.js" async></script>
```

Docs: [docs/integrations/snippet.md](./docs/integrations/snippet.md)

## Webhook de compra

Por conexão em Integrações (Hotmart/Kiwify/Eduzz):

`POST https://SEU_DOMINIO/api/webhook/in/{connectionId}`  
Header: `x-webhook-token: <secret da conexão>`

## Dev local (sem Docker)

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

Migrations em `db/migrations/` aplicam sozinhas no boot.

## Contribuir

Fork + PR. Labels de release e canais `beta`/`main`: [CONTRIBUTING.md](./CONTRIBUTING.md).

## Docs

- [CURSOR.md](./CURSOR.md) — arquitetura
- [DEPLOY.md](./DEPLOY.md) — Portainer / Swarm / Actions
- [SECURITY.md](./SECURITY.md) — checklist
- [docs/SELF-HOSTED.md](./docs/SELF-HOSTED.md) — uma stack por domínio
- [CHANGELOG.md](./CHANGELOG.md) — versões
