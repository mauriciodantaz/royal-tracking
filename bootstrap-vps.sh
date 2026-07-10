#!/usr/bin/env bash
# Bootstrap Royal Tracking na VPS do zero (RoyalServer).
# Rode UMA VEZ como root na nova VPS:
#   curl -fsSL ... | bash
#   ou: bash bootstrap-vps.sh
set -euo pipefail

DOMAIN="${ROYAL_TRACKING_DOMAIN:-tracking.royalserver.com.br}"
PROJECT_DIR="${ROYAL_TRACKING_DIR:-/root/projects/tracking}"
VOLUME_DATA="/var/lib/docker/volumes/tracking/_data"
STACK_NAME="${ROYAL_TRACKING_STACK:-tracking}"
TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-RoyalNet}"
REPO_URL="${ROYAL_TRACKING_REPO:-https://github.com/mauriciodantaz/tracking.git}"
# Até o merge do self-hosted na main, use a feature branch:
BRANCH="${ROYAL_TRACKING_BRANCH:-feat/self-hosted-oss}"
SERVICE_NAME="${STACK_NAME}_tracking"
export ROYAL_TRACKING_BRANCH="$BRANCH"

echo "=== Royal Tracking — bootstrap VPS ==="
echo "Domínio:  $DOMAIN"
echo "Projeto:  $PROJECT_DIR"
echo "Volume:   $VOLUME_DATA"
echo "Rede:     $TRAEFIK_NET"
echo "Branch:   $BRANCH"
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

# Swarm
if ! docker info 2>/dev/null | grep -q 'Swarm: active'; then
  echo "==> Inicializando Docker Swarm"
  docker swarm init || true
fi

# Rede Traefik
if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
  echo "==> Criando rede overlay $TRAEFIK_NET"
  docker network create --driver overlay --attachable "$TRAEFIK_NET" || true
else
  echo "==> Rede $TRAEFIK_NET ok"
fi

# Pastas + volume bind path (Swarm/Portainer costuma usar este path)
echo "==> Criando pastas"
mkdir -p /root/projects
mkdir -p "$VOLUME_DATA"
chmod 755 /var/lib/docker/volumes/tracking 2>/dev/null || true

# Clone
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

# Secrets
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
ADMIN_PASSWORD="$(gen_secret | head -c 24)"

if [[ -f "$PROJECT_DIR/.env" ]]; then
  echo "==> .env já existe — não sobrescrevo"
else
  echo "==> Criando .env"
  cat > "$PROJECT_DIR/.env" <<EOF
# Gerado por bootstrap-vps.sh — não commitar
DATABASE_URL=postgresql://tracking:${DB_PASSWORD}@postgres:5432/tracking
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

# Stack com Postgres + app (volume)
STACK_FILE="/tmp/${STACK_NAME}-bootstrap.yml"
# shellcheck disable=SC2016
cat > "$STACK_FILE" <<EOF
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tracking
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: tracking
    volumes:
      - tracking_pg:/var/lib/postgresql/data
    networks:
      - internal
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: "0.5"
          memory: 512M

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
      - internal
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
  internal:
    driver: overlay
  traefik_public:
    external: true
    name: ${TRAEFIK_NET}

volumes:
  tracking_pg:
EOF

# Se .env já existia, a senha do Postgres no stack pode não bater —
# nesse caso só deployamos se o usuário confirmar via FORCE_STACK=1
if [[ "${CREATED_ENV:-0}" -eq 1 ]] || [[ "${FORCE_STACK:-0}" -eq 1 ]]; then
  echo "==> Deploy stack $STACK_NAME"
  docker stack deploy -c "$STACK_FILE" "$STACK_NAME"
else
  echo "==> .env pré-existente: NÃO redeployei a stack (senha Postgres desconhecida)."
  echo "    Ajuste o stack no Portainer ou rode FORCE_STACK=1 bash bootstrap-vps.sh"
fi

# Placeholder no volume para o service não crashar antes do 1º build
if [[ ! -f "$VOLUME_DATA/server.js" ]]; then
  echo "==> Placeholder no volume (até o primeiro deploy.sh)"
  cat > "$VOLUME_DATA/server.js" <<'JS'
console.log("Royal Tracking: rode /root/projects/tracking/deploy.sh para o primeiro build.");
setInterval(() => {}, 60_000);
JS
  # .env no volume também (entrypoint carrega /app/.env)
  if [[ -f "$PROJECT_DIR/.env" ]]; then
    cp -f "$PROJECT_DIR/.env" "$VOLUME_DATA/.env"
  fi
fi

echo
echo "==> Primeiro build (pode demorar alguns minutos)"
"$PROJECT_DIR/deploy.sh"

echo
echo "=== Bootstrap OK ==="
echo "URL:     https://${DOMAIN}"
if [[ "${CREATED_ENV:-0}" -eq 1 ]]; then
  echo "Admin:   admin@${DOMAIN}"
  echo "Senha:   ${ADMIN_PASSWORD}"
  echo
  echo "Guarde a senha. Está também em $PROJECT_DIR/.env"
fi
echo
echo "Checagens:"
echo "  docker service ls | grep $STACK_NAME"
echo "  docker service ps ${SERVICE_NAME} --no-trunc"
echo "  curl -I https://${DOMAIN}"
echo
echo "DNS: aponte ${DOMAIN} (A) para o IP desta VPS se ainda não apontou."
echo "Actions: atualize VPS_HOST / VPS_USER / VPS_SSH_KEY no GitHub."
