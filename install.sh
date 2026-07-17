#!/usr/bin/env bash
# Royal Tracking — setup interativo da infra (padrão royaltracking_<projeto>)
#
# Pergunta o nome da empresa/projeto e cria:
#   stack / serviço / volume / DB / user = royaltracking_<slug>
# Postgres fica em stack EXTERNA (hostname na RoyalNet); o script cria role+DB nele.
#
# Uso (na VPS, root):
#   bash install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/deploy/lib/naming.sh"

IMAGE="${ROYAL_TRACKING_IMAGE:-royalserver/royal-tracking:latest}"
TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-RoyalNet}"
REPO_URL="${ROYAL_TRACKING_REPO:-git@github.com:mauriciodantaz/tracking.git}"
BRANCH="${ROYAL_TRACKING_BRANCH:-main}"
BUILD_ON_VPS="${ROYAL_TRACKING_BUILD_ON_VPS:-1}"

echo "=== Royal Tracking — setup (royaltracking_<projeto>) ==="
echo

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode como root." >&2
  exit 1
fi

read -r -p "Nome da empresa / projeto (ex: fizzing, royalserver): " PROJECT_LABEL
PROJECT_LABEL="${PROJECT_LABEL// /}"
if [[ -z "$PROJECT_LABEL" ]]; then
  echo "Nome obrigatório." >&2
  exit 1
fi

royal_tracking_set_names "$PROJECT_LABEL"

read -r -p "Domínio (ex: tracking.royalgrowth.com.br): " DOMAIN
DOMAIN="${DOMAIN// /}"
if [[ -z "$DOMAIN" ]]; then
  echo "Domínio obrigatório." >&2
  exit 1
fi

# Apex da marca (strip do primeiro label): tracking.royalgrowth.com.br → royalgrowth.com.br
DEFAULT_APEX="${DOMAIN#*.}"
if [[ "$DEFAULT_APEX" == "$DOMAIN" ]]; then
  DEFAULT_APEX="$DOMAIN"
fi
read -r -p "Apex permitido p/ eventos (vírgula p/ vários) [${DEFAULT_APEX}]: " ALLOWED_EVENT_DOMAINS
ALLOWED_EVENT_DOMAINS="${ALLOWED_EVENT_DOMAINS:-$DEFAULT_APEX}"

read -r -p "E-mail do admin [admin@${DOMAIN}]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
read -r -s -p "Senha do admin (vazio = gerar): " ADMIN_PASSWORD
echo
read -r -p "Hostname do Postgres na Swarm (serviço na RoyalNet): " PG_HOST
if [[ -z "$PG_HOST" ]]; then
  echo "Hostname do Postgres obrigatório." >&2
  exit 1
fi
read -r -p "Rede Traefik/apps [${TRAEFIK_NET}]: " NET_IN
TRAEFIK_NET="${NET_IN:-$TRAEFIK_NET}"
read -r -p "Criar role/DB no Postgres agora? (precisa de acesso admin) [Y/n]: " CREATE_DB
CREATE_DB="${CREATE_DB:-Y}"

echo
echo "Vai criar:"
echo "  Prefixo:  ${INSTANCE_PREFIX}"
echo "  Stack:    ${STACK_NAME}"
echo "  Serviço:  ${SERVICE_NAME}"
echo "  Volume:   ${VOLUME_DATA}"
echo "  Projeto:  ${PROJECT_DIR}"
echo "  DB/user:  ${PG_DB} / ${PG_USER}"
echo "  Domínio:  ${DOMAIN}"
echo "  Apex:     ${ALLOWED_EVENT_DOMAINS}"
echo "  Rede:     ${TRAEFIK_NET}"
echo
read -r -p "Confirmar? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelado."
  exit 0
fi

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 64
  fi
}

DB_PASSWORD="$(gen_secret)"
ENCRYPTION_KEY="$(gen_secret)"
AUTH_SECRET="$(gen_secret)"
if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(gen_secret | head -c 24)"
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker inacessível." >&2
  exit 1
fi

if ! docker info 2>/dev/null | grep -q 'Swarm: active'; then
  docker swarm init || true
fi

if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
  echo "==> Criando rede overlay $TRAEFIK_NET"
  docker network create --driver overlay --attachable "$TRAEFIK_NET" || true
fi

echo "==> Pastas"
mkdir -p /root/projects
mkdir -p "$VOLUME_DATA"

# Deploy key SSH (repo privado) — obrigatório para clone/fetch sem prompt
DEPLOY_KEY="${ROYAL_TRACKING_DEPLOY_KEY:-$HOME/.ssh/tracking_deploy}"
if [[ -f "$DEPLOY_KEY" ]]; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  echo "==> Usando deploy key: $DEPLOY_KEY"
else
  echo "AVISO: $DEPLOY_KEY não encontrada — git clone/fetch pode falhar no repo privado."
fi

# Fonte local opcional (evita segundo clone): /root/projects/tracking-src
LOCAL_SRC="${ROYAL_TRACKING_LOCAL_SRC:-/root/projects/tracking-src}"

# Clone do código (build-on-VPS) ou só pasta para .env/.instance
if [[ "$BUILD_ON_VPS" == "1" ]]; then
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    echo "==> Repo já existe — atualizando $BRANCH"
    git -C "$PROJECT_DIR" fetch origin
    git -C "$PROJECT_DIR" checkout "$BRANCH"
    git -C "$PROJECT_DIR" reset --hard "origin/$BRANCH"
  elif [[ -d "$LOCAL_SRC/.git" ]]; then
    echo "==> Copiando de $LOCAL_SRC → $PROJECT_DIR"
    git clone --branch "$BRANCH" "$LOCAL_SRC" "$PROJECT_DIR"
    # Reapontar origin para o GitHub (não para o path local)
    git -C "$PROJECT_DIR" remote set-url origin "$REPO_URL"
    git -C "$PROJECT_DIR" fetch origin "$BRANCH" || true
  else
    echo "==> Clonando $REPO_URL ($BRANCH) → $PROJECT_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  fi
  chmod +x "$PROJECT_DIR/deploy.sh" "$PROJECT_DIR/install.sh" "$PROJECT_DIR/bootstrap-vps.sh" 2>/dev/null || true
  if [[ -f "$DEPLOY_KEY" ]]; then
    git -C "$PROJECT_DIR" config core.sshCommand "ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  fi
else
  mkdir -p "$PROJECT_DIR"
fi

# shellcheck disable=SC1091
source "${PROJECT_DIR}/deploy/lib/naming.sh" 2>/dev/null || true
royal_tracking_set_names "$PROJECT_SLUG"
royal_tracking_write_instance_file "$DOMAIN" "$PG_HOST"

echo "==> .env"
cat > "${PROJECT_DIR}/.env" <<EOF
# Instância ${INSTANCE_PREFIX} — gerado por install.sh
DATABASE_URL=postgresql://${PG_USER}:${DB_PASSWORD}@${PG_HOST}:5432/${PG_DB}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=https://${DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
ALLOWED_EVENT_DOMAINS=${ALLOWED_EVENT_DOMAINS}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
TZ=America/Sao_Paulo
EOF
chmod 600 "${PROJECT_DIR}/.env"

# Criar role/DB no Postgres externo
if [[ "$CREATE_DB" =~ ^[Yy]$ ]]; then
  echo "==> Criando role/DB no Postgres externo"
  read -r -p "Nome do serviço Swarm do Postgres (para docker exec) [${PG_HOST}]: " PG_SERVICE
  PG_SERVICE="${PG_SERVICE:-$PG_HOST}"
  read -r -p "User admin do Postgres [postgres]: " PG_ADMIN
  PG_ADMIN="${PG_ADMIN:-postgres}"

  TASK_ID="$(docker service ps -q -f desired-state=running "$PG_SERVICE" 2>/dev/null | head -n1 || true)"
  if [[ -z "$TASK_ID" ]]; then
    # tenta nome completo stack_service
    echo "Não achei task running de '$PG_SERVICE'. Listando serviços postgres:"
    docker service ls | grep -i postgres || true
    read -r -p "Informe o nome EXATO do serviço Postgres: " PG_SERVICE
    TASK_ID="$(docker service ps -q -f desired-state=running "$PG_SERVICE" | head -n1)"
  fi
  CID="$(docker inspect --format '{{.Status.ContainerStatus.ContainerID}}' "$TASK_ID")"

  docker exec -i -u "$PG_ADMIN" "$CID" psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE ${PG_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${PG_USER} WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'ok_role' AS status;
SQL

  docker exec -i -u "$PG_ADMIN" "$CID" psql -v ON_ERROR_STOP=1 <<SQL
SELECT 'create_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB}');
SQL

  # CREATE DATABASE não roda dentro de DO em todas as versões — tenta direto
  docker exec -i -u "$PG_ADMIN" "$CID" psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
    || docker exec -i -u "$PG_ADMIN" "$CID" psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

  docker exec -i -u "$PG_ADMIN" "$CID" psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};"
  echo "DB ${PG_DB} ok"
else
  echo "==> SQL para rodar no Postgres externo:"
  echo "  CREATE USER ${PG_USER} WITH PASSWORD '${DB_PASSWORD}';"
  echo "  CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"
  echo "  GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};"
fi

STACK_FILE="/tmp/${STACK_NAME}-stack.yml"

# Escape for YAML double-quoted strings
_yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

_DB_URL="postgresql://${PG_USER}:${DB_PASSWORD}@${PG_HOST}:5432/${PG_DB}"
_NEXTAUTH_URL="https://${DOMAIN}"

if [[ "$BUILD_ON_VPS" == "1" ]]; then
  # App via volume + node alpine — env no YAML (padrão n8n)
  cat > "$STACK_FILE" <<EOF
version: "3.7"

services:
  ${SERVICE_KEY}:
    image: node:22-alpine
    working_dir: /app
    command: ["node", "server.js"]
    volumes:
      - ${VOLUME_DATA}:/app
    networks:
      - royalnet
    environment:
      TZ: America/Sao_Paulo
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      DATABASE_URL: "$(_yaml_escape "${_DB_URL}")"
      ENCRYPTION_KEY: "$(_yaml_escape "${ENCRYPTION_KEY}")"
      AUTH_SECRET: "$(_yaml_escape "${AUTH_SECRET}")"
      NEXTAUTH_URL: "$(_yaml_escape "${_NEXTAUTH_URL}")"
      NEXT_PUBLIC_APP_URL: "$(_yaml_escape "${_NEXTAUTH_URL}")"
      ALLOWED_EVENT_DOMAINS: "$(_yaml_escape "${ALLOWED_EVENT_DOMAINS}")"
      ADMIN_EMAIL: "$(_yaml_escape "${ADMIN_EMAIL}")"
      ADMIN_PASSWORD: "$(_yaml_escape "${ADMIN_PASSWORD}")"
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: "1.0"
          memory: 1024M
      labels:
        - traefik.enable=true
        - traefik.http.routers.${ROUTER_NAME}.rule=Host(\`${DOMAIN}\`)
        - traefik.http.services.${ROUTER_NAME}.loadbalancer.server.port=3000
        - traefik.http.routers.${ROUTER_NAME}.service=${ROUTER_NAME}
        - traefik.http.routers.${ROUTER_NAME}.tls.certresolver=letsencryptresolver
        - traefik.http.routers.${ROUTER_NAME}.entrypoints=websecure
        - traefik.http.routers.${ROUTER_NAME}.tls=true

networks:
  royalnet:
    external: true
    name: ${TRAEFIK_NET}
EOF
else
  cat > "$STACK_FILE" <<EOF
version: "3.8"

services:
  ${SERVICE_KEY}:
    image: ${IMAGE}
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      TZ: America/Sao_Paulo
      DATABASE_URL: "$(_yaml_escape "${_DB_URL}")"
      ENCRYPTION_KEY: "$(_yaml_escape "${ENCRYPTION_KEY}")"
      AUTH_SECRET: "$(_yaml_escape "${AUTH_SECRET}")"
      NEXTAUTH_URL: "$(_yaml_escape "${_NEXTAUTH_URL}")"
      NEXT_PUBLIC_APP_URL: "$(_yaml_escape "${_NEXTAUTH_URL}")"
      ALLOWED_EVENT_DOMAINS: "$(_yaml_escape "${ALLOWED_EVENT_DOMAINS}")"
      ADMIN_EMAIL: "$(_yaml_escape "${ADMIN_EMAIL}")"
      ADMIN_PASSWORD: "$(_yaml_escape "${ADMIN_PASSWORD}")"
    networks:
      - royalnet
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      labels:
        - traefik.enable=true
        - traefik.http.routers.${ROUTER_NAME}.rule=Host(\`${DOMAIN}\`)
        - traefik.http.services.${ROUTER_NAME}.loadbalancer.server.port=3000
        - traefik.http.routers.${ROUTER_NAME}.service=${ROUTER_NAME}
        - traefik.http.routers.${ROUTER_NAME}.tls.certresolver=letsencryptresolver
        - traefik.http.routers.${ROUTER_NAME}.entrypoints=websecure
        - traefik.http.routers.${ROUTER_NAME}.tls=true

networks:
  royalnet:
    external: true
    name: ${TRAEFIK_NET}
EOF
fi

echo "==> Deploy stack ${STACK_NAME}"
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"
cp -f "$STACK_FILE" "${PROJECT_DIR}/stack.deployed.yml" 2>/dev/null || true
# Também grava YAML para colar no Portainer (com secrets)
cp -f "$STACK_FILE" "${PROJECT_DIR}/portainer-stack.generated.yml" 2>/dev/null || true
chmod 600 "${PROJECT_DIR}/portainer-stack.generated.yml" 2>/dev/null || true

if [[ "$BUILD_ON_VPS" == "1" ]]; then
  if [[ ! -f "${VOLUME_DATA}/server.js" ]]; then
    echo 'console.log("Royal Tracking placeholder — rode deploy.sh"); setInterval(()=>{},6e4);' > "${VOLUME_DATA}/server.js"
  fi
  echo "==> Primeiro build"
  (
    cd "$PROJECT_DIR"
    export ROYAL_TRACKING_INSTANCE_FILE="${INSTANCE_FILE}"
    ./deploy.sh
  )
fi

echo
echo "=== Setup OK — ${INSTANCE_PREFIX} ==="
echo "URL:      https://${DOMAIN}"
echo "Stack:    ${STACK_NAME}"
echo "Serviço:  ${SERVICE_NAME}"
echo "DB:       ${PG_USER}@${PG_HOST}:5432/${PG_DB}"
echo "Login:    ${ADMIN_EMAIL}"
echo "Senha:    ${ADMIN_PASSWORD}"
echo "Snippet:  <script src=\"https://${DOMAIN}/snippet.js\" async></script>"
echo "Webhook:  https://${DOMAIN}/api/webhook/in/{connectionId}  (Integrações)"
echo
echo "Arquivos: ${PROJECT_DIR}/.env  ${INSTANCE_FILE}"
echo "YAML Portainer (env incluso): ${PROJECT_DIR}/portainer-stack.generated.yml"
echo "  cat ${PROJECT_DIR}/portainer-stack.generated.yml"
echo "  # ou: bash ${PROJECT_DIR}/deploy/print-stack-yml.sh"
echo "Deploy:   cd ${PROJECT_DIR} && ./deploy.sh"
echo "Actions:  aponte o workflow para ${PROJECT_DIR}/deploy.sh"
