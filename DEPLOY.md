# Deploy RoyalServer — Royal Tracking

Domínio: **https://tracking.fizzing.marketing**

Fluxo (igual aos seus outros projetos, adaptado para Next.js):

```txt
git push main
→ GitHub Actions (SSH)
→ /root/projects/tracking/deploy.sh
→ git pull + npm ci + build standalone
→ copia para volume Docker
→ docker service update --force tracking_tracking
→ Traefik (Host tracking.fizzing.marketing → :3000)
```

Diferença vs sites Vite: **não é Nginx/`dist`**. É Node 22 com `server.js` (standalone) na porta **3000**.

## Checklist

1. [x] DNS Cloudflare: `tracking` → IP da VPS (A)
2. [x] Volume: `mkdir -p /var/lib/docker/volumes/tracking/_data`
3. [x] Stack Portainer: colar `deploy/portainer-stack.yml` (nome stack: `tracking`)
4. [x] Deploy key VPS no repo GitHub
5. [x] Clone: `/root/projects/tracking`
6. [x] `.env` na VPS em `/root/projects/tracking/.env`
7. [x] `deploy.sh` + `chmod +x`
8. [x] Teste manual `./deploy.sh` (service converged)
9. [x] Secrets Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
10. [ ] Push workflow → Actions verde

Arquivos no repo:
- [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml)
- [`deploy.sh`](./deploy.sh)
- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
