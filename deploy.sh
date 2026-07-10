#!/bin/bash
set -euo pipefail

# Deploy Royal Tracking — lê .instance (padrão royaltracking_<projeto>)
# Build roda DENTRO de um container Node (não precisa de npm no host).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/deploy/lib/naming.sh"

INSTANCE_FILE="${ROYAL_TRACKING_INSTANCE_FILE:-${SCRIPT_DIR}/.instance}"
if [[ -f "$INSTANCE_FILE" ]]; then
  royal_tracking_load_instance "$INSTANCE_FILE"
else
  # Fallback legado (instância única antiga)
  PROJECT_DIR="${PROJECT_DIR:-/root/projects/tracking}"
  VOLUME_DATA="${VOLUME_DATA:-/var/lib/docker/volumes/tracking/_data}"
  SERVICE_NAME="${SERVICE_NAME:-tracking_tracking}"
  DOMAIN="${DOMAIN:-tracking.royalserver.com.br}"
  echo "AVISO: sem .instance — usando paths legados. Prefira install.sh (royaltracking_<projeto>)."
fi

BUILD_IMAGE="node:22-alpine"
BRANCH="${ROYAL_TRACKING_BRANCH:-main}"

cd "$PROJECT_DIR"

DEPLOY_KEY="${ROYAL_TRACKING_DEPLOY_KEY:-$HOME/.ssh/tracking_deploy}"
if [[ -f "$DEPLOY_KEY" ]]; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  git config core.sshCommand "ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

echo "==> Git branch: $BRANCH (ROYAL_TRACKING_BRANCH=${ROYAL_TRACKING_BRANCH:-unset})"
git fetch origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .instance -e node_modules -e .next -e stack.deployed.yml -e portainer-stack.generated.yml
echo "==> HEAD: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

if [ ! -f .env ]; then
  echo "ERRO: $PROJECT_DIR/.env não existe. Rode install.sh antes do primeiro deploy."
  exit 1
fi

mkdir -p "$VOLUME_DATA"

echo "==> Build Next.js (Docker $BUILD_IMAGE) — ${INSTANCE_PREFIX:-legacy}"
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
rm -rf .next/standalone/db
cp -a db .next/standalone/db

echo "==> Publicar no volume $VOLUME_DATA"
rm -rf "${VOLUME_DATA:?}/"*
cp -a .next/standalone/. "$VOLUME_DATA/"
# Env fica na stack Portainer (YAML), não no volume.
# Mantém .env no PROJECT_DIR para print-stack-yml.sh / backup.

echo "==> Reiniciar service $SERVICE_NAME"
if docker service inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  docker service update --force "$SERVICE_NAME"
else
  echo "AVISO: service $SERVICE_NAME ainda não existe. Cole o YAML no Portainer:"
  echo "  bash ${PROJECT_DIR}/deploy/print-stack-yml.sh"
fi

echo "Deploy Royal Tracking OK → https://${DOMAIN:-?}"
echo "Instância: ${INSTANCE_PREFIX:-legacy} | stack service: $SERVICE_NAME"
