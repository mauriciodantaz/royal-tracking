# Deploy — Royal Tracking · padrão `royaltracking_<projeto>`

Domínio exemplo: **https://tracking.royalserver.com.br**  
Rede: **`RoyalNet`** · Postgres: **stack externa**

## Naming (obrigatório)

Tudo derivado do nome da empresa/projeto:

| Recurso | Padrão |
|---------|--------|
| Prefixo | `royaltracking_<slug>` |
| Stack Portainer/Swarm | `royaltracking_<slug>` |
| Serviço | `royaltracking_<slug>_app` |
| Volume | `/var/lib/docker/volumes/royaltracking_<slug>/_data` |
| Pasta no host | `/root/projects/royaltracking_<slug>` |
| DB + user Postgres | `royaltracking_<slug>` |
| Traefik router | `royaltracking_<slug>` |

Ex.: projeto `royalserver` → stack `royaltracking_royalserver`, DB `royaltracking_royalserver`.

Slug: minúsculas, `[a-z0-9_]`, gerado por `deploy/lib/naming.sh`.

## Setup do zero (recomendado)

Na VPS (root), com deploy key SSH já configurada:

```bash
mkdir -p /root/projects && cd /root/projects
GIT_SSH_COMMAND='ssh -i ~/.ssh/tracking_deploy -o IdentitiesOnly=yes' \
  git clone -b feat/self-hosted-oss git@github.com:mauriciodantaz/tracking.git tracking-src
cd tracking-src
chmod +x install.sh deploy.sh
./install.sh
```

O script pergunta:

1. **Nome da empresa/projeto** → gera o prefixo `royaltracking_<slug>`
2. Domínio
3. Admin
4. Hostname do Postgres na Swarm
5. Se cria role/DB no Postgres externo agora

Depois sobe a stack **só do app**, gera `.env` + `.instance`, e roda o primeiro build.

## Deploys seguintes

```bash
cd /root/projects/royaltracking_<slug>
./deploy.sh
```

`deploy.sh` lê `.instance` (paths, service name, domínio).

### GitHub Actions

Aponte o secret/script para a pasta da instância, ex.:

```yaml
script: |
  /root/projects/royaltracking_royalserver/deploy.sh
```

(ou variável `ROYAL_TRACKING_INSTANCE` se padronizar depois)

## Portainer manual

Template: [`deploy/portainer-stack.yml`](./deploy/portainer-stack.yml) — troque `<SLUG>` e `<DOMAIN>`.  
Stack name no Portainer = `royaltracking_<SLUG>`.

## Checagem

```bash
docker service ls | grep royaltracking_
docker service ps royaltracking_<slug>_app --no-trunc
curl -I https://SEU_DOMINIO
```
