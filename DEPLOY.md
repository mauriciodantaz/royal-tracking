# Deploy — Royal Tracking · padrão `royaltracking_<projeto>`

Domínio exemplo: **https://tracking.royalserver.com.br**  
Rede: **`RoyalNet`** · Postgres: **stack externa**

## Regra de ouro (env)

**Secrets ficam no YAML da stack Portainer** (`environment:`), igual ao n8n.  
O volume só tem o **build standalone** (`server.js`, `.next`, `public`, `db/`).  
Não usar `.env` no volume / `env_file` no Swarm.

| Onde | O quê |
|------|--------|
| Stack Portainer YAML | `DATABASE_URL`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_*`, … |
| Volume `_data` | artefatos do `deploy.sh` (código) |
| `/root/projects/royaltracking_<slug>/.env` | backup local + input do `print-stack-yml.sh` (não é o que o container lê em produção) |

Gerar YAML com secrets a partir do `.env` da instância:

```bash
cd /root/projects/royaltracking_<slug>
bash deploy/print-stack-yml.sh
# cole a saída no Portainer (Add stack / Editor)
```

## Naming (obrigatório)

| Recurso | Padrão |
|---------|--------|
| Prefixo | `royaltracking_<slug>` |
| Stack Portainer/Swarm | `royaltracking_<slug>` |
| Serviço | `royaltracking_<slug>_app` |
| Volume | `/var/lib/docker/volumes/royaltracking_<slug>/_data` |
| Pasta no host | `/root/projects/royaltracking_<slug>` |
| DB + user Postgres | `royaltracking_<slug>` |
| Traefik router | `royaltracking_<slug>` |

Ex.: projeto `dev` → stack `royaltracking_dev`.

## Setup do zero

```bash
# clone fonte + deploy key
cd /root/projects/tracking-src   # ou clone fresco
./install.sh
```

O script cria DB/user, `.env`/`.instance`, sobe a stack e faz o 1º build.  
Para editar no Portainer: remova a stack CLI (`docker stack rm …`) e recrie colando o YAML gerado (`print-stack-yml.sh`).

## Deploys seguintes (código)

```bash
cd /root/projects/royaltracking_<slug>
./deploy.sh
```

Atualiza só o volume + `docker service update --force`. Env continua no YAML.

### GitHub Actions

```yaml
script: |
  /root/projects/royaltracking_dev/deploy.sh
```

Ajuste o path se o slug for outro.

## Checagem

```bash
docker service ps royaltracking_<slug>_app --no-trunc
curl -I https://SEU_DOMINIO
```
