# Deploy checklist — tracking

Strategy: docker-swarm-volume-node | Framework: nextjs | Build mode: docker
<!-- smoke: Actions → ops/deploy.sh (2026-07-13) -->

## Pós-geração

- [x] Variáveis de `.env.example` → `environment:` no YAML do Portainer
- [x] VPS OS = Debian 11; comandos em bash
- [x] Build via Docker (`node:22-alpine`) — sem npm no host
- [x] Workflow path = `/root/projects/tracking/ops/deploy.sh`
- [x] Service name auto-detect (`^royaltracking_` ou legado `^tracking_`)
- [x] Stack creation = Portainer only
- [x] Traefik Host = `tracking.royalgrowth.com.br`
- [x] `PROJECT_NAME` + `ALLOWED_EVENT_DOMAINS` no YAML
- [x] Multi-repo: alias `github.com-tracking` + Deploy Key por slug
- [x] Postgres externo preservado (`DB_POSTGRESDB_*` no YAML de entrega; só o volume do app mudou)

## Identificação

- [x] Repositório: mauriciodantaz/tracking
- [x] Naming: `royaltracking_<slug>` (slugify de `PROJECT_NAME`)
- [x] Framework: Next.js standalone
- [x] Estratégia: Swarm volume + `node server.js`
- [x] URL pública: https://tracking.royalgrowth.com.br

## Artefatos

- [x] `ops/stack.yml` (placeholders no Git; YAML preenchido na entrega)
- [x] Pasta VPS: `/root/projects/royaltracking_<slug>` (legado: `/root/projects/tracking`)
- [x] Volume: `/var/lib/docker/volumes/royaltracking_<slug>/_data`
- [x] Deploy script: `ops/deploy.sh` (lê `.instance` quando existir)
- [x] Sem criação de stack via SSH CLI / sem `PENDING`

## Migração do legado (stack `tracking` → `royaltracking_<slug>`)

- [ ] Remover stack antiga no Portainer (UI), se ainda existir
- [ ] Criar stack nova `royaltracking_<slug>` colando o YAML com `PROJECT_NAME`
- [ ] Volume antigo → republicar via `ops/deploy.sh` no path novo
- [ ] Manter o Postgres/user já existente (`DB_POSTGRESDB_*` no YAML de entrega)
- [ ] Apontar clone para `/root/projects/royaltracking_<slug>`

## Acesso

- [ ] Deploy Key ≠ chave Actions
- [ ] `ssh -T git@github.com-tracking` → `Hi mauriciodantaz/tracking!`
- [ ] Remote: `git@github.com-tracking:mauriciodantaz/tracking.git`
- [ ] `VPS_SSH_KEY` = privada com BEGIN/END (não fingerprint, não `.pub`)
- [ ] Teste PC: `ssh -i $HOME\.ssh\tracking_actions -o IdentitiesOnly=yes root@IP_DA_VPS "echo ok"`

## VPS

- [ ] `chmod +x /root/projects/tracking/ops/deploy.sh`
- [ ] Stack `tracking` no Portainer
- [ ] `docker service ls | grep tracking`
- [ ] Deploy manual OK
- [ ] Actions OK
- [ ] `curl -I https://tracking.royalgrowth.com.br`
- [ ] DNS `tracking.royalgrowth.com.br` → VPS
- [ ] Snippet / webhooks / OAuth redirect no novo host

## Notas

- Rede Swarm externa: a mesma do YAML de referência da VPS (preservar o nome da rede).
- Env de produção fica no YAML Portainer, não no volume.
- Legado: `deploy.sh` / `install.sh` na raiz redirecionam ou ficam obsoletos; o entrypoint oficial é `ops/deploy.sh`.
