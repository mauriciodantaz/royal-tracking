# Deploy RoyalServer — Tracking

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

1. [ ] DNS Cloudflare: `tracking` → IP da VPS (A)
2. [ ] Volume: `mkdir -p /var/lib/docker/volumes/tracking/_data`
3. [ ] Stack Portainer: colar `deploy/portainer-stack.yml` (nome stack: `tracking`)
4. [ ] Deploy key VPS no repo GitHub
5. [ ] Clone: `/root/projects/tracking`
6. [ ] `.env` na VPS em `/root/projects/tracking/.env`
7. [ ] `deploy.sh` + `chmod +x`
8. [ ] Teste manual `./deploy.sh`
9. [ ] Secrets Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
10. [ ] Push workflow → Actions verde

Arquivos no repo:
- [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml)
- [`deploy.sh`](./deploy.sh)
- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
