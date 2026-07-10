#!/bin/bash
set -euo pipefail

# Deploy Royal Tracking (Next.js) — RoyalServer / Docker Swarm
# Build roda DENTRO de um container Node (não precisa de npm no host).

PROJECT_DIR="/root/projects/tracking"
DEST="/var/lib/docker/volumes/tracking/_data"
SERVICE_NAME="tracking_tracking"
BUILD_IMAGE="node:22-alpine"
# Até merge do self-hosted: feat/self-hosted-oss. Depois: main.
BRANCH="${ROYAL_TRACKING_BRANCH:-feat/self-hosted-oss}"

cd "$PROJECT_DIR"

# Descarta alterações locais no clone da VPS (ex.: edits manuais em deploy.sh)
# para o pull nunca falhar no Actions.
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e node_modules -e .next

if [ ! -f .env ]; then
  echo "ERRO: $PROJECT_DIR/.env não existe. Rode bootstrap-vps.sh antes do primeiro deploy."
  exit 1
fi

mkdir -p "$DEST"

echo "==> Build Next.js (Docker $BUILD_IMAGE)"
docker run --rm \
  -v "$PROJECT_DIR":/app \
  -w /app \
  -e NEXT_TELEMETRY_DISABLED=1 \
  "$BUILD_IMAGE" \
  sh -c "npm ci --legacy-peer-deps && npm run build"

if [ ! -f .next/standalone/server.js ]; then
  echo "ERRO: build não gerou .next/standalone/server.js (next.config output: standalone?)"
  exit 1
fi

echo "==> Preparar standalone + estáticos + migrations"
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
cp -r public .next/standalone/public
# Migrations SQL (boot do app aplica em db/migrations)
rm -rf .next/standalone/db
cp -a db .next/standalone/db

echo "==> Publicar no volume $DEST"
rm -rf "${DEST:?}/"*
cp -a .next/standalone/. "$DEST/"
cp -f .env "$DEST/.env"

echo "==> Reiniciar service $SERVICE_NAME"
if docker service inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  docker service update --force "$SERVICE_NAME"
else
  echo "AVISO: service $SERVICE_NAME ainda não existe. Suba a stack (bootstrap-vps.sh / Portainer)."
fi

echo "Deploy Royal Tracking OK → https://tracking.royalserver.com.br"
