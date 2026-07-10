#!/usr/bin/env bash
# Royal Tracking — install.sh (VPS / Swarm + Traefik)
# App only; Postgres = stack EXTERNA na mesma rede (padrão n8n / RoyalServer).
set -euo pipefail

IMAGE="${ROYAL_TRACKING_IMAGE:-royalserver/royal-tracking:latest}"
STACK_NAME="${ROYAL_TRACKING_STACK:-royal-tracking}"
TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-RoyalNet}"

echo "=== Royal Tracking installer (Postgres externo) ==="
echo "Imagem: $IMAGE"
echo "Stack:  $STACK_NAME"
echo

read -r -p "Domínio (ex: tracking.royalserver.com.br): " DOMAIN
DOMAIN="${DOMAIN// /}"
if [[ -z "$DOMAIN" ]]; then
  echo "Domínio obrigatório." >&2
  exit 1
fi

read -r -p "E-mail do admin: " ADMIN_EMAIL
read -r -s -p "Senha do admin: " ADMIN_PASSWORD
echo
read -r -p "Hostname do Postgres na Swarm (ex: postgres): " PG_HOST
PG_HOST="${PG_HOST:-postgres}"
read -r -p "User Postgres [tracking]: " PG_USER
PG_USER="${PG_USER:-tracking}"
read -r -p "Database [tracking]: " PG_DB
PG_DB="${PG_DB:-tracking}"
read -r -s -p "Senha do Postgres (user acimaPG_USER}): " DB_PASSWORD
echo
read -r -p "Rede Traefik/apps [$TRAEFIK_NET]: " NET_IN
TRAEFIK_NET="${NET_IN:-$TRAEFIK_NET}"

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 64
  fi
}

ENCRYPTION_KEY="$(gen_secret)"
AUTH_SECRET="$(gen_secret)"
APP_URL="https://${DOMAIN}"

STACK_FILE="/tmp/${STACK_NAME}-stack.yml"
cat > "$STACK_FILE" <<EOF
version: "3.8"

services:
  app:
    image: ${IMAGE}
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      TZ: America/Sao_Paulo
      DATABASE_URL: postgresql://${PG_USER}:${DB_PASSWORD}@${PG_HOST}:5432/${PG_DB}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      AUTH_SECRET: ${AUTH_SECRET}
      NEXTAUTH_URL: ${APP_URL}
      NEXT_PUBLIC_APP_URL: ${APP_URL}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    networks:
      - traefik_public
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      labels:
        - traefik.enable=true
        - traefik.http.routers.${STACK_NAME}.rule=Host(\`${DOMAIN}\`)
        - traefik.http.services.${STACK_NAME}.loadbalancer.server.port=3000
        - traefik.http.routers.${STACK_NAME}.service=${STACK_NAME}
        - traefik.http.routers.${STACK_NAME}.tls.certresolver=letsencryptresolver
        - traefik.http.routers.${STACK_NAME}.entrypoints=websecure
        - traefik.http.routers.${STACK_NAME}.tls=true

networks:
  traefik_public:
    external: true
    name: ${TRAEFIK_NET}
EOF

if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
  echo "Aviso: rede externa '$TRAEFIK_NET' não encontrada." >&2
fi

echo
echo "Deploy da stack '$STACK_NAME' (app only)..."
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

echo
echo "=== Pronto ==="
echo "URL:      $APP_URL"
echo "Login:    $ADMIN_EMAIL"
echo "Postgres: ${PG_USER}@${PG_HOST}:5432/${PG_DB} (stack externa)"
echo "Snippet:  <script src=\"${APP_URL}/snippet.js\" async></script>"
echo "Webhook:  ${APP_URL}/api/webhook/compra"
echo
echo "Crie user/DB no Postgres externo se ainda não existirem."
echo "Atualizar imagem: docker service update --image ${IMAGE} ${STACK_NAME}_app"
