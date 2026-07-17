# Deploy — tracking (Git to VPS)

**URL:** https://tracking.royalgrowth.com.br  
**Entrypoint:** `/root/projects/tracking/ops/deploy.sh`  
**Stack:** Portainer UI only (colar `ops/stack.yml` preenchido)  
**Volume:** `/var/lib/docker/volumes/tracking/_data` (só o build standalone)

## Regra de env

Secrets ficam no `environment:` do YAML Portainer. O volume só tem código (`server.js`, `.next`, `public`, `db/`).  
Inclua `ALLOWED_EVENT_DOMAINS=royalgrowth.com.br` (apex da marca; aceita todos os subdomínios).

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
