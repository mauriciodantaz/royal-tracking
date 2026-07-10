#!/usr/bin/env bash
# Bootstrap Royal Tracking na VPS (RoyalServer) — app only.
# Postgres = stack EXTERNA (mesma rede RoyalNet), igual n8n.
#
# Variáveis opcionais:
#   ROYAL_TRACKING_PG_HOST   hostname do serviço Postgres na Swarm (ex: postgres)
#   ROYAL_TRACKING_PG_USER   default: tracking
#   ROYAL_TRACKING_PG_DB     default: tracking
#   ROYAL_TRACKING_PG_PASSWORD  se vazio, gera uma (você cria o role no PG externo)
set -euo pipefail

DOMAIN="${ROYAL_TRACKING_DOMAIN:-tracking.royalserver.com.br}"
PROJECT_DIR="${ROYAL_TRACKING_DIR:-/root/projects/tracking}"
VOLUME_DATA="/var/lib/docker/volumes/tracking/_data"
STACK_NAME="${ROYAL_TRACKING_STACK:-tracking}"
TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-RoyalNet}"
REPO_URL="${ROYAL_TRACKING_REPO:-git@github.com:mauriciodantaz/tracking.git}"
BRANCH="${ROYAL_TRACKING_BRANCH:-feat/self-hosted-oss}"
SERVICE_NAME="${STACK_NAME}_tracking"
export ROYAL_TRACKING_BRANCH="$BRANCH"

PG_HOST="${ROYAL_TRACKING_PG_HOST:-postgres}"
PG_USER="${ROYAL_TRACKING_PG_USER:-tracking}"
PG_DB="${ROYAL_TRACKING_PG_DB:-tracking}"

echo "=== Royal Tracking — bootstrap VPS (Postgres externo) ==="
echo "Domínio:   $DOMAIN"
echo "Projeto:   $PROJECT_DIR"
echo "Volume:    $VOLUME_DATA"
echo "Rede:      $TRAEFIK_NET"
echo "PG host:   $PG_HOST (stack externa)"
echo "Branch:    $BRANCH"
echo

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode como root." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon inacessível." >&2
  exit 1
fi

if ! docker info 2>/dev/null | grep -q 'Swarm: active'; then
  echo "==> Inicializando Docker Swarm"
  docker swarm init || true
fi

if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
  echo "==> Criando rede overlay $TRAEFIK_NET"
  docker network create --driver overlay --attachable "$TRAEFIK_NET" || true
else
  echo "==> Rede $TRAEFIK_NET ok"
fi

echo "==> Criando pastas"
mkdir -p /root/projects
mkdir -p "$VOLUME_DATA"
chmod 755 /var/lib/docker/volumes/tracking 2>/dev/null || true

if [[ -d "$PROJECT_DIR/.git" ]]; then
  echo "==> Repo já existe em $PROJECT_DIR — fetch $BRANCH"
  git -C "$PROJECT_DIR" fetch origin
  git -C "$PROJECT_DIR" checkout "$BRANCH"
  git -C "$PROJECT_DIR" reset --hard "origin/$BRANCH"
else
  echo "==> Clonando $REPO_URL ($BRANCH)"
  git clone --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
fi

cd "$PROJECT_DIR"
chmod +x deploy.sh bootstrap-vps.sh 2>/dev/null || true

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 64
  fi
}

DB_PASSWORD="${ROYAL_TRACKING_PG_PASSWORD:-$(gen_secret)}"
ENCRYPTION_KEY="$(gen_secret)"
AUTH_SECRET="$(gen_secret)"
ADMIN_PASSWORD="$(gen_secret | head -c 24)"

if [[ -f "$PROJECT_DIR/.env" ]]; then
  echo "==> .env já existe — não sobrescrevo"
  CREATED_ENV=0
else
  echo "==> Criando .env (aponta para Postgres externo @$PG_HOST)"
  cat > "$PROJECT_DIR/.env" <<EOF
# Gerado por bootstrap-vps.sh — não commitar
# Postgres = stack EXTERNA na rede ${TRAEFIK_NET}
DATABASE_URL=postgresql://${PG_USER}:${DB_PASSWORD}@${PG_HOST}:5432/${PG_DB}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=https://${DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
ADMIN_EMAIL=admin@${DOMAIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
TZ=America/Sao_Paulo
EOF
  chmod 600 "$PROJECT_DIR/.env"
  CREATED_ENV=1
fi

STACK_FILE="/tmp/${STACK_NAME}-bootstrap.yml"
cat > "$STACK_FILE" <<EOF
version: "3.7"

services:
  tracking:
    image: node:22-alpine
    working_dir: /app
    command:
      - sh
      - -c
      - |
        set -a
        [ -f /app/.env ] && . /app/.env
        set +a
        exec node server.js
    volumes:
      - ${VOLUME_DATA}:/app
    networks:
      - traefik_public
    environment:
      - TZ=America/Sao_Paulo
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
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
        - traefik.http.routers.tracking.rule=Host(\`${DOMAIN}\`)
        - traefik.http.services.tracking.loadbalancer.server.port=3000
        - traefik.http.routers.tracking.service=tracking
        - traefik.http.routers.tracking.tls.certresolver=letsencryptresolver
        - traefik.http.routers.tracking.entrypoints=websecure
        - traefik.http.routers.tracking.tls=true

networks:
  traefik_public:
    external: true
    name: ${TRAEFIK_NET}
EOF

echo "==> Deploy stack $STACK_NAME (app only — sem Postgres)"
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

if [[ ! -f "$VOLUME_DATA/server.js" ]]; then
  echo "==> Placeholder no volume (até o primeiro deploy.sh)"
  cat > "$VOLUME_DATA/server.js" <<'JS'
console.log("Royal Tracking: rode /root/projects/tracking/deploy.sh para o primeiro build.");
setInterval(() => {}, 60_000);
JS
fi

if [[ -f "$PROJECT_DIR/.env" ]]; then
  cp -f "$PROJECT_DIR/.env" "$VOLUME_DATA/.env"
fi

echo
echo "==> Primeiro build (pode demorar alguns minutos)"
"$PROJECT_DIR/deploy.sh"

echo
echo "=== Bootstrap OK ==="
echo "URL:     https://${DOMAIN}"
echo "Stack:   $STACK_NAME (somente app)"
echo "Postgres externo: host=$PG_HOST db=$PG_DB user=$PG_USER"
if [[ "${CREATED_ENV:-0}" -eq 1 ]]; then
  echo
  echo "Admin:   admin@${DOMAIN}"
  echo "Senha:   ${ADMIN_PASSWORD}"
  echo "PG pass: ${DB_PASSWORD}"
  echo
  echo "Crie o role/DB no Postgres EXTERNO (se ainda não existir), ex.:"
  echo "  CREATE USER ${PG_USER} WITH PASSWORD '${DB_PASSWORD}';"
  echo "  CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"
  echo "  GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};"
  echo
  echo "Confirme que o serviço Postgres está na rede ${TRAEFIK_NET}"
  echo "e que o hostname DNS Swarm é exatamente: ${PG_HOST}"
  echo
  echo "Guarde as senhas. Estão em $PROJECT_DIR/.env"
fi
echo
echo "Checagens:"
echo "  docker service ls | grep $STACK_NAME"
echo "  docker service ps ${SERVICE_NAME} --no-trunc"
echo "  curl -I https://${DOMAIN}"
echo
echo "DNS: aponte ${DOMAIN} (A) para o IP desta VPS se ainda não apontou."
echo "Actions: atualize VPS_HOST / VPS_USER / VPS_SSH_KEY no GitHub."
