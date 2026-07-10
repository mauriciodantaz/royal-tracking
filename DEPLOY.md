# Deploy — Royal Tracking (RoyalServer) do zero

Domínio: **https://tracking.royalserver.com.br**  
VPS: RoyalServer · rede Traefik **`RoyalNet`**

## Bootstrap (primeira vez na VPS)

Na **nova** VPS, como `root`:

```bash
# 1) DNS já apontando tracking.royalserver.com.br → IP desta VPS (recomendado)

# 2) Deploy key SSH (repo privado) — chave privada em ~/.ssh/tracking_deploy
#    (pública já registrada no GitHub como "VPS RoyalServer")

# 3) Clone + bootstrap
mkdir -p /root/projects && cd /root/projects
GIT_SSH_COMMAND='ssh -i ~/.ssh/tracking_deploy -o IdentitiesOnly=yes' \
  git clone -b feat/self-hosted-oss git@github.com:mauriciodantaz/tracking.git tracking
cd tracking
chmod +x bootstrap-vps.sh deploy.sh
./bootstrap-vps.sh
```

> Até mergear `feat/self-hosted-oss` na `main`, o bootstrap e o `deploy.sh` usam essa branch (`ROYAL_TRACKING_BRANCH`). Depois do merge, mude para `main`.

O `bootstrap-vps.sh` faz:

1. Garante Swarm + rede `RoyalNet`
2. Cria `/var/lib/docker/volumes/tracking/_data`
3. Clona/atualiza `/root/projects/tracking`
4. Gera `.env` (Postgres, ENCRYPTION_KEY, AUTH_SECRET, admin)
5. Sobe stack `tracking` (Postgres + app Node no volume)
6. Roda o primeiro `deploy.sh` (build + publica no volume)

Anote a senha do admin impressa no final.

### Checagem

```bash
docker service ls | grep tracking
docker service ps tracking_tracking --no-trunc
curl -I https://tracking.royalserver.com.br
```

## Deploys seguintes (GitHub Actions)

```txt
git push main
→ Actions SSH → /root/projects/tracking/deploy.sh
→ build no container node:22-alpine
→ copia standalone + db/ + .env → volume
→ docker service update --force tracking_tracking
```

Secrets no repo:

| Secret | Valor |
|--------|--------|
| `VPS_HOST` | IP da **nova** VPS |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | chave privada cujo `.pub` está no `authorized_keys` desta VPS |

## Stack manual (Portainer)

Arquivo de referência: [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml)

- Troque `CHANGE_ME_DB_PASSWORD` pela mesma senha do `DATABASE_URL` no `.env`
- Volume app: `/var/lib/docker/volumes/tracking/_data`
- Volume Postgres: `tracking_pg` (nome Swarm)

## Env

Ver [`.env.example`](./.env.example). O bootstrap gera um `.env` completo em `/root/projects/tracking/.env` (e copia para o volume).

`DATABASE_URL` usa host `postgres` (serviço na rede interna da stack).

## Imagem Docker Hub (alternativa)

Sem build na VPS: [`.github/workflows/docker-hub.yml`](./.github/workflows/docker-hub.yml) + [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) + [`install.sh`](./install.sh).
