# Deploy — Royal Tracking

**Imagem canônica (OSS):** `mauriciodantaz/royal-tracking`  
**Tags:** `:latest` (= `:stable`) · `:beta` · `:X.Y.Z` / `:X.Y.Z-stable` / `:X.Y.Z-beta`  
**Template Portainer (Hub):** [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml)  
**Naming:** stack / volume / DB = `royaltracking_<slug>`

Demo interna: https://tracking.royalgrowth.com.br

## Caminho OSS (recomendado)

1. Colar [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) no Portainer (preencher env).
2. Pull da imagem Hub — sem build na VPS.
3. Atualizar com `docker service update --image mauriciodantaz/royal-tracking:latest royaltracking_<slug>_app`.

Canais CI:

- push em `beta` → `:beta` + `:X.Y.Z-beta`
- merge em `main` com label `release:*` → tag git `X.Y.Z` → `:X.Y.Z` + `:X.Y.Z-stable` + `:stable` + `:latest`
- push em `dev` → **não** publica no Hub (só deploy VPS interno; ver abaixo)

Secrets: ver [`ops/DOCKER-HUB.md`](./ops/DOCKER-HUB.md).

## Regra de env

Secrets ficam no `environment:` do YAML Portainer. Inclua `PROJECT_NAME`, `DB_POSTGRESDB_*` e `ALLOWED_EVENT_DOMAINS` (apex da marca).

## Variante avançada — build na VPS (volume Swarm)

Usado para a demo interna (Royal Growth) via Actions. Canal: branch **`dev`** apenas — `beta`/`main` não disparam deploy na VPS.

- Template: [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml) (`node:22-alpine` + volume do build)
- Entrypoint: `ops/deploy.sh` em `/root/projects/royaltracking_<slug>` (`BRANCH=dev`)
- YAML preenchido: `bash deploy/print-stack-yml.sh`
- `ROYAL_TRACKING_BUILD_ON_VPS=1 bash install.sh`
- GitHub Actions: push em `dev` → [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) + `vars.VPS_PROJECT_DIR`

> Fallback legado em `ops/deploy.sh` (sem `.instance`): `/root/projects/tracking` + volume `tracking`. Preferir sempre `royaltracking_<slug>`.

## Checagem

```bash
docker service ls | grep royaltracking_
curl -I https://SEU_DOMINIO
```

Detalhes: [`ops/DEPLOY-CHECKLIST.md`](./ops/DEPLOY-CHECKLIST.md) · [`docs/SELF-HOSTED.md`](./docs/SELF-HOSTED.md).
