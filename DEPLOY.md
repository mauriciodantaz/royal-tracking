# Deploy — Royal Tracking (RoyalServer) · Postgres externo

Domínio: **https://tracking.royalserver.com.br**  
Rede Traefik / apps: **`RoyalNet`**  
Postgres: **stack externa** (mesmo padrão do n8n — não sobe PG dentro do tracking)

## Arquitetura

```txt
Stack Postgres (já existente na VPS)
  └─ serviço ex.: postgres  ──RoyalNet──┐
                                        ├─ Stack tracking (só o app Node)
Traefik ── Host(tracking.royalserver.com.br) ─┘
```

`DATABASE_URL` usa o **hostname Swarm** do Postgres (nome do serviço), não `localhost`.

## 1) Postgres externo — criar DB/user

No container/serviço do Postgres da VPS:

```sql
CREATE USER tracking WITH PASSWORD 'SENHA_FORTE';
CREATE DATABASE tracking OWNER tracking;
GRANT ALL PRIVILEGES ON DATABASE tracking TO tracking;
```

Anote o **hostname** do serviço na Swarm (ex.: `postgres`, `postgres_postgres`, etc.):

```bash
docker service ls | grep -i postgres
```

## 2) Bootstrap do app (volume + clone + .env + stack app)

```bash
# Deploy key SSH já em ~/.ssh/tracking_deploy (repo privado)

mkdir -p /root/projects && cd /root/projects
GIT_SSH_COMMAND='ssh -i ~/.ssh/tracking_deploy -o IdentitiesOnly=yes' \
  git clone -b feat/self-hosted-oss git@github.com:mauriciodantaz/tracking.git tracking
cd tracking
git config core.sshCommand 'ssh -i ~/.ssh/tracking_deploy -o IdentitiesOnly=yes'
chmod +x bootstrap-vps.sh deploy.sh

# Ajuste o host do PG se não for "postgres":
#   export ROYAL_TRACKING_PG_HOST=NOME_DO_SERVICO_PG
#   export ROYAL_TRACKING_PG_PASSWORD='SENHA_FORTE'
./bootstrap-vps.sh
```

O bootstrap:

1. Cria `/var/lib/docker/volumes/tracking/_data`
2. Gera `.env` com `DATABASE_URL=...@PG_HOST:5432/tracking`
3. Sobe stack **`tracking` só com o app** (sem Postgres)
4. Roda o primeiro `deploy.sh`

Schema: o app aplica `db/migrations/` no boot (não precisa SQL manual além do CREATE USER/DB).

## 3) Stack no Portainer (alternativa ao bootstrap)

Arquivo: [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml) — **somente** serviço `tracking` + `RoyalNet`.

Env fica no `.env` do volume (preenchido pelo `deploy.sh`), não no YAML.

## Deploys seguintes (GitHub Actions)

```txt
push main → SSH → deploy.sh → build → volume → service update --force tracking_tracking
```

Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (nova VPS).

## Checagem

```bash
docker service ls | grep tracking
# só tracking_tracking (não tracking_postgres)

docker service ps tracking_tracking --no-trunc
curl -I https://tracking.royalserver.com.br
```

Se a app não conectar no banco: hostname errado, user/senha, ou Postgres fora da `RoyalNet`.
