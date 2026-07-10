# Deploy — Royal Tracking (RoyalServer)

Domínio: **https://tracking.royalserver.com.br**  
VPS: RoyalServer (rede Traefik `RoyalNet`)

## Fluxo atual (build na VPS)

```txt
git push main
→ GitHub Actions (.github/workflows/deploy.yml)
→ SSH (secrets VPS_HOST / VPS_USER / VPS_SSH_KEY) → nova VPS RoyalServer
→ /root/projects/tracking/deploy.sh
→ git pull + npm ci + build standalone (container node:22-alpine)
→ copia para volume Docker
→ docker service update --force tracking_tracking
→ Traefik Host(tracking.royalserver.com.br) → :3000
```

Arquivos:
- [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml) — stack Node + Traefik
- [`deploy.sh`](./deploy.sh)
- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

## Checklist — nova VPS

1. [ ] DNS Cloudflare: `tracking.royalserver.com.br` → IP da **nova** VPS (A)
2. [ ] Rede Swarm Traefik: `RoyalNet` (external)
3. [ ] Volume: `mkdir -p /var/lib/docker/volumes/tracking/_data`
4. [ ] Stack Portainer: colar `deploy/portainer-stack.yml` (nome stack: `tracking`)
5. [ ] Clone: `/root/projects/tracking` + deploy key / acesso git
6. [ ] `.env` em `/root/projects/tracking/.env` (ver `.env.example`)
7. [ ] `chmod +x deploy.sh` e teste manual `./deploy.sh`
8. [ ] Secrets Actions apontando para a **nova** VPS:
   - `VPS_HOST` — IP público da nova VPS
   - `VPS_USER` — `root` (ou o user com a chave)
   - `VPS_SSH_KEY` — chave privada do Actions (`.pub` no `authorized_keys` da nova VPS)
9. [ ] Push `main` ou *Run workflow* → Actions verde
10. [ ] Abrir https://tracking.royalserver.com.br

## Env mínimo no `.env` da VPS

Com self-hosted (branch OSS): `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL=https://tracking.royalserver.com.br`, `NEXT_PUBLIC_APP_URL=...`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

Se ainda estiver no fluxo legado Supabase nesta VPS, use as vars Supabase do `.env` antigo até o cutover.

## Imagem Docker Hub (opcional / futuro)

Workflow [`.github/workflows/docker-hub.yml`](./.github/workflows/docker-hub.yml) + stack [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) + [`install.sh`](./install.sh).  
Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
