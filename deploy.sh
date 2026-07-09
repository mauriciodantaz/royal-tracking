#!/bin/bash
set -euo pipefail

# Deploy Tracking (Next.js) — RoyalServer / Docker Swarm
# Chamado pelo GitHub Actions via SSH após push na main.

cd /root/projects/tracking

git pull origin main

# Env da app (nunca no git) — deve existir na VPS
if [ ! -f .env ]; then
  echo "ERRO: /root/projects/tracking/.env não existe. Crie antes do primeiro deploy."
  exit 1
fi

npm ci --legacy-peer-deps
npm run build

# Standalone: estáticos ao lado do server.js
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
cp -r public .next/standalone/public

# Volume servido pelo container Node
DEST="/var/lib/docker/volumes/tracking/_data"
mkdir -p "$DEST"
rm -rf "${DEST:?}/"*
cp -a .next/standalone/. "$DEST/"
cp -f .env "$DEST/.env"

# Nome do service: STACK_SERVICE (ex.: tracking_tracking)
docker service update --force tracking_tracking

echo "Deploy tracking OK → https://tracking.fizzing.marketing"
