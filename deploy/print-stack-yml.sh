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

# Prefer discrete Postgres vars; derive from DATABASE_URL / .instance if needed
_DB_HOST="${DB_POSTGRESDB_HOST:-${PG_HOST:-postgres}}"
_DB_PORT="${DB_POSTGRESDB_PORT:-5432}"
_DB_USER="${DB_POSTGRESDB_USER:-${PG_USER:-$INSTANCE_PREFIX}}"
_DB_PASS="${DB_POSTGRESDB_PASSWORD:-}"
_DB_NAME="${DB_POSTGRESDB_DATABASE:-${PG_DB:-$INSTANCE_PREFIX}}"

if [[ -z "$_DB_PASS" && -n "${DATABASE_URL:-}" ]]; then
  # postgresql://user:pass@host:port/db
  _rest="${DATABASE_URL#*://}"
  _userinfo="${_rest%%@*}"
  _DB_USER="${_userinfo%%:*}"
  _DB_PASS="${_userinfo#*:}"
  _hostport_db="${_rest#*@}"
  _hostport="${_hostport_db%%/*}"
  _DB_HOST="${_hostport%%:*}"
  if [[ "$_hostport" == *:* ]]; then
    _DB_PORT="${_hostport##*:}"
  fi
  _DB_NAME="${_hostport_db#*/}"
  _DB_NAME="${_DB_NAME%%\?*}"
fi

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
      # --- Runtime ---
      TZ: America/Sao_Paulo
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"

      # --- Instância ---
      PROJECT_NAME: "$(yq "${PROJECT_NAME:-$PROJECT_SLUG}")"
      # PLATFORM_NAME: "Outro Nome"   # opcional — rebatiza o produto (padrão: Royal Tracking)

      # --- Postgres (externo na RoyalNet) ---
      DB_POSTGRESDB_HOST: "$(yq "${_DB_HOST}")"
      DB_POSTGRESDB_PORT: "$(yq "${_DB_PORT}")"
      DB_POSTGRESDB_USER: "$(yq "${_DB_USER}")"
      DB_POSTGRESDB_PASSWORD: "$(yq "${_DB_PASS}")"
      DB_POSTGRESDB_DATABASE: "$(yq "${_DB_NAME}")"

      # --- Auth / crypto ---
      ENCRYPTION_KEY: "$(yq "${ENCRYPTION_KEY}")"
      AUTH_SECRET: "$(yq "${AUTH_SECRET}")"
      NEXTAUTH_URL: "$(yq "${NEXTAUTH_URL}")"
      NEXT_PUBLIC_APP_URL: "$(yq "${NEXT_PUBLIC_APP_URL:-$NEXTAUTH_URL}")"

      # --- Domínios / eventos ---
      ALLOWED_EVENT_DOMAINS: "$(yq "${ALLOWED_EVENT_DOMAINS:-}")"

      # --- Super admin (imutável — só stack) ---
      ADMIN_EMAIL: "$(yq "${ADMIN_EMAIL}")"
      ADMIN_PASSWORD: "$(yq "${ADMIN_PASSWORD}")"

      # --- SMTP (convite, reset de senha) ---
      SMTP_HOST: "$(yq "${SMTP_HOST:-}")"
      SMTP_PORT: "$(yq "${SMTP_PORT:-587}")"
      SMTP_SECURE: "$(yq "${SMTP_SECURE:-false}")"
      SMTP_USER: "$(yq "${SMTP_USER:-}")"
      SMTP_PASS: "$(yq "${SMTP_PASS:-}")"
      SMTP_FROM: "$(yq "${SMTP_FROM:-}")"
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
