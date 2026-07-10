#!/usr/bin/env bash
# Gera YAML da stack Portainer com environment (a partir de .env + .instance).
# Uso: cd /root/projects/royaltracking_dev && bash deploy/print-stack-yml.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT}/deploy/lib/naming.sh"

INSTANCE_FILE="${ROYAL_TRACKING_INSTANCE_FILE:-${ROOT}/.instance}"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "Falta .instance em $ROOT" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta .env em $ROOT" >&2
  exit 1
fi

royal_tracking_load_instance "$INSTANCE_FILE"

# shellcheck disable=SC1090
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-RoyalNet}"
SERVICE_KEY="${SERVICE_KEY:-app}"
ROUTER_NAME="${ROUTER_NAME:-$INSTANCE_PREFIX}"
VOLUME_DATA="${VOLUME_DATA:-/var/lib/docker/volumes/${INSTANCE_PREFIX}/_data}"

# Escape for YAML double-quoted strings
yq() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat <<EOF
version: "3.7"

# Stack Portainer — ${INSTANCE_PREFIX}
# Env no YAML (padrão n8n). Volume só com o build standalone.

services:
  ${SERVICE_KEY}:
    image: node:22-alpine
    working_dir: /app
    command: ["node", "server.js"]
    volumes:
      - ${VOLUME_DATA}:/app
    networks:
      - RoyalNet
    environment:
      TZ: America/Sao_Paulo
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      DATABASE_URL: "$(yq "${DATABASE_URL}")"
      ENCRYPTION_KEY: "$(yq "${ENCRYPTION_KEY}")"
      AUTH_SECRET: "$(yq "${AUTH_SECRET}")"
      NEXTAUTH_URL: "$(yq "${NEXTAUTH_URL}")"
      NEXT_PUBLIC_APP_URL: "$(yq "${NEXT_PUBLIC_APP_URL:-$NEXTAUTH_URL}")"
      ADMIN_EMAIL: "$(yq "${ADMIN_EMAIL}")"
      ADMIN_PASSWORD: "$(yq "${ADMIN_PASSWORD}")"
    deploy:
      mode: replicated
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
  RoyalNet:
    external: true
    name: ${TRAEFIK_NET}
EOF
