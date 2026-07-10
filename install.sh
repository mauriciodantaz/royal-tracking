#!/usr/bin/env bash
# Royal Tracking — install.sh (VPS / Swarm + Traefik)
# Uso: curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
#   ou: bash install.sh
set -euo pipefail

IMAGE="${ROYAL_TRACKING_IMAGE:-royalserver/royal-tracking:latest}"
STACK_NAME="${ROYAL_TRACKING_STACK:-royal-tracking}"
TRAEFIK_NET="${ROYAL_TRACKING_NETWORK:-fizzing_net}"

echo "=== Royal Tracking installer ==="
echo "Imagem: $IMAGE"
echo "Stack:  $STACK_NAME"
echo

read -r -p "Domínio (ex: tracking.cliente.com): " DOMAIN
DOMAIN="${DOMAIN// /}"
if [[ -z "$DOMAIN" ]]; then
  echo "Domínio obrigatório." >&2
  exit 1
fi

read -r -p "E-mail do admin: " ADMIN_EMAIL
read -r -s -p "Senha do admin: " ADMIN_PASSWORD
echo
read -r -s -p "Senha do Postgres: " DB_PASSWORD
echo
read -r -p "Rede Traefik externa [$TRAEFIK_NET]: " NET_IN
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
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tracking
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: tracking
    volumes:
      - ${STACK_NAME}_pg:/var/lib/postgresql/data
    networks:
      - internal
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

  app:
    image: ${IMAGE}
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      TZ: America/Sao_Paulo
      DATABASE_URL: postgresql://tracking:${DB_PASSWORD}@postgres:5432/tracking
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      AUTH_SECRET: ${AUTH_SECRET}
      NEXTAUTH_URL: ${APP_URL}
      NEXT_PUBLIC_APP_URL: ${APP_URL}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    networks:
      - internal
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
  internal:
    driver: overlay
  traefik_public:
    external: true
    name: ${TRAEFIK_NET}

volumes:
  ${STACK_NAME}_pg:
EOF

if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
  echo "Aviso: rede externa '$TRAEFIK_NET' não encontrada. Crie-a ou ajuste o nome." >&2
fi

echo
echo "Deploy da stack '$STACK_NAME'..."
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

echo
echo "=== Pronto ==="
echo "URL:      $APP_URL"
echo "Login:    $ADMIN_EMAIL"
echo "Snippet:  <script src=\"${APP_URL}/snippet.js\" async></script>"
echo "Webhook:  ${APP_URL}/api/webhook/compra"
echo
echo "Configure o token do webhook no painel → Configuração."
echo "Stack file temporário: $STACK_FILE (apague se não precisar)."
echo
echo "Atualizar imagem depois:"
echo "  docker service update --image ${IMAGE} ${STACK_NAME}_app"
