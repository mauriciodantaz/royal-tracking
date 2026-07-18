# Deploy — tracking (Git to VPS)

**URL:** https://tracking.royalgrowth.com.br  
**Naming:** stack / volume / DB = `royaltracking_<slug>` (ex.: `royaltracking_dev`)  
**Entrypoint:** `ops/deploy.sh` (com `.instance` do `install.sh`, ou legado `/root/projects/tracking`)  
**Stack:** Portainer UI only (colar YAML preenchido; nome da stack = `royaltracking_<slug>`)  
**Volume:** `/var/lib/docker/volumes/royaltracking_<slug>/_data` (só o build standalone)

## Regra de env

Secrets ficam no `environment:` do YAML Portainer. O volume só tem código (`server.js`, `.next`, `public`, `db/`).  
Inclua `PROJECT_NAME`, `DB_POSTGRESDB_*` (Postgres estilo n8n) e `ALLOWED_EVENT_DOMAINS` (apex da marca).

## Deploys

```bash
/root/projects/tracking/ops/deploy.sh
```

GitHub Actions chama o mesmo path após push em `main`.

## Checagem

```bash
docker service ls | grep tracking
curl -I https://tracking.royalgrowth.com.br
```

Detalhes: `ops/DEPLOY-CHECKLIST.md` e entrega Git to VPS no chat.
