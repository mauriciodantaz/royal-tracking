# Deploy checklist — tracking

Strategy: docker-swarm-volume-node | Framework: nextjs | Build mode: docker

## Pós-geração

- [x] Variáveis de `.env.example` → `environment:` no YAML do Portainer
- [x] VPS OS = Debian 11; comandos em bash
- [x] Build via Docker (`node:22-alpine`) — sem npm no host
- [x] Workflow usa `vars.VPS_PROJECT_DIR` → `ops/deploy.sh`
- [x] Service name auto-detect (`^royaltracking_`; fallback legado `^tracking_`)
- [x] Stack creation = Portainer only
- [x] Traefik Host = `tracking.royalgrowth.com.br`
- [x] `PROJECT_NAME` + `ALLOWED_EVENT_DOMAINS` no YAML
- [x] Multi-repo: alias `github.com-tracking` + Deploy Key por slug
- [x] Postgres externo preservado (`DB_POSTGRESDB_*` no YAML de entrega; só o volume do app mudou)

## Identificação

- [x] Repositório: mauriciodantaz/royal-tracking
- [x] Naming: `royaltracking_<slug>` (slugify de `PROJECT_NAME`)
- [x] Framework: Next.js standalone
- [x] Estratégia: Swarm volume + `node server.js`
- [x] URL pública: https://tracking.royalgrowth.com.br

## Docker Hub (OSS)

- [ ] Secrets no GitHub: `DOCKERHUB_USERNAME` = `mauriciodantaz`, `DOCKERHUB_TOKEN` = access token
- [ ] Imagem: `mauriciodantaz/royal-tracking` (`:latest`=:stable` / `:beta` / `:X.Y.Z`)
- [ ] Template canônico: `deploy/royal-tracking-stack.yml`
- [ ] Workflows: `docker-publish.yml` + `release.yml`

## Artefatos

- [x] Template Portainer Hub: `deploy/royal-tracking-stack.yml`
- [x] Template Portainer volume/build: `deploy/portainer-stack.yml` + gerador `deploy/print-stack-yml.sh`
- [x] Pasta VPS: `/root/projects/royaltracking_<slug>`
- [x] Volume: `/var/lib/docker/volumes/royaltracking_<slug>/_data`
- [x] Deploy script: `ops/deploy.sh` (lê `.instance`)
- [x] Sem criação de stack via SSH CLI / sem `PENDING`

## Migração do legado (stack `tracking` → `royaltracking_<slug>`)

- [ ] Remover stack antiga no Portainer (UI), se ainda existir
- [ ] Criar stack nova `royaltracking_<slug>` colando o YAML com `PROJECT_NAME`
- [ ] Volume antigo → republicar via `ops/deploy.sh` no path novo
- [ ] Manter o Postgres/user já existente (`DB_POSTGRESDB_*` no YAML de entrega)
- [ ] Apontar clone para `/root/projects/royaltracking_<slug>`
- [ ] Definir `VPS_PROJECT_DIR` no GitHub (Settings → Variables) para o path novo

## Acesso

- [ ] Deploy Key ≠ chave Actions
- [ ] `ssh -T git@github.com-tracking` → `Hi mauriciodantaz/royal-tracking!`
- [ ] Remote: `git@github.com-tracking:mauriciodantaz/royal-tracking.git`
- [ ] `VPS_SSH_KEY` = privada com BEGIN/END (não fingerprint, não `.pub`)
- [ ] Teste PC: `ssh -i $HOME\.ssh\tracking_actions -o IdentitiesOnly=yes root@IP_DA_VPS "echo ok"`

## VPS

- [ ] `chmod +x /root/projects/royaltracking_<slug>/ops/deploy.sh`
- [ ] Stack `royaltracking_<slug>` no Portainer
- [ ] `docker service ls | grep royaltracking_`
- [ ] Deploy manual OK
- [ ] Actions OK (`VPS_PROJECT_DIR` preenchida)
- [ ] `curl -I https://tracking.royalgrowth.com.br`
- [ ] DNS `tracking.royalgrowth.com.br` → VPS
- [ ] Snippet / webhooks / OAuth redirect no novo host

## Notas

- Rede Swarm externa: a mesma do YAML de referência da VPS (preservar o nome da rede).
- Env de produção fica no YAML Portainer, não no volume.
- Shims na raiz: `deploy.sh` → `ops/deploy.sh`; `bootstrap-vps.sh` → `install.sh`.
