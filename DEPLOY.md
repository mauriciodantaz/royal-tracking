# Deploy — Royal Tracking (self-hosted)

## Modelo recomendado (OSS)

```txt
git push main
→ GitHub Actions (.github/workflows/docker-hub.yml)
→ Docker Hub royalserver/royal-tracking:latest + :sha
→ Na VPS: docker service update --image ...  OU  install.sh / Portainer stack
→ Traefik → app:3000
→ Postgres na mesma stack (rede interna)
```

Arquivos:
- [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) — referência Portainer
- [`install.sh`](./install.sh) — wizard interativo
- [`Dockerfile`](./Dockerfile) — multi-stage standalone
- [docs/SELF-HOSTED.md](./docs/SELF-HOSTED.md)

### Secrets no GitHub Actions

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

### Env na stack (Portainer)

Ver `.env.example`. Nunca colar secrets reais no YAML versionado — use placeholders e edite no Portainer.

## Legado (build na VPS)

O fluxo antigo (`deploy.sh` + volume + `deploy/portainer-stack.yml` + Actions SSH) ainda existe para a instância `tracking.fizzing.marketing` enquanto não houver cutover para a imagem Hub + Postgres local.

```txt
git push main
→ Actions SSH → deploy.sh → build standalone no volume → service update --force
```

Prefira migrar para a imagem Hub assim que validar numa stack paralela.
