#!/bin/bash
set -euo pipefail

# Deploy Royal Tracking (Next.js) — RoyalServer / Docker Swarm
# Build roda DENTRO de um container Node (não precisa de npm no host).

PROJECT_DIR="/root/projects/tracking"
DEST="/var/lib/docker/volumes/tracking/_data"
SERVICE_NAME="tracking_tracking"
BUILD_IMAGE="node:22-alpine"

cd "$PROJECT_DIR"

# Descarta alterações locais no clone da VPS (ex.: edits manuais em deploy.sh)
# para o pull nunca falhar no Actions.
git fetch origin main
git reset --hard origin/main
git clean -fd -e .env -e node_modules -e .next

if [ ! -f .env ]; then
  echo "ERRO: $PROJECT_DIR/.env não existe. Crie antes do primeiro deploy."
  exit 1
fi

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

echo "==> Preparar standalone + estáticos"
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
cp -r public .next/standalone/public

echo "==> Publicar no volume $DEST"
mkdir -p "$DEST"
rm -rf "${DEST:?}/"*
cp -a .next/standalone/. "$DEST/"
cp -f .env "$DEST/.env"

echo "==> Reiniciar service $SERVICE_NAME"
docker service update --force "$SERVICE_NAME"

echo "Deploy Royal Tracking OK → https://tracking.fizzing.marketing"
