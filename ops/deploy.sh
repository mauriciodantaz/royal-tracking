#!/usr/bin/env bash
set -Eeuo pipefail

# Git to VPS — Next.js standalone → Swarm volume + service update
# Target OS: Debian 11 (bullseye) + bash.
# Prefer .instance (install.sh): stack/volume = royaltracking_<slug>
# Legacy fallback: /root/projects/tracking + volume tracking
# Stack creation: Portainer UI only. This script never creates/updates the stack via SSH CLI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT}/deploy/lib/naming.sh"

INSTANCE_FILE="${ROYAL_TRACKING_INSTANCE_FILE:-${ROOT}/.instance}"

if [[ -f "$INSTANCE_FILE" ]]; then
  royal_tracking_load_instance "$INSTANCE_FILE"
  REPOSITORY_SLUG="${INSTANCE_PREFIX}"
  PROJECT_DIR="${PROJECT_DIR:-/root/projects/${INSTANCE_PREFIX}}"
  VOLUME_DIR="${VOLUME_DATA:-/var/lib/docker/volumes/${INSTANCE_PREFIX}/_data}"
  SERVICE_MATCH="^${STACK_NAME}_"
  PUBLIC_URL="${NEXTAUTH_URL:-https://${DOMAIN:-}}"
else
  # Legado (antes do padrão royaltracking_<slug>)
  REPOSITORY_SLUG="tracking"
  PROJECT_DIR="/root/projects/${REPOSITORY_SLUG}"
  VOLUME_DIR="/var/lib/docker/volumes/tracking/_data"
  SERVICE_MATCH="^${REPOSITORY_SLUG}_"
  PUBLIC_URL="https://tracking.royalgrowth.com.br"
fi

BRANCH="dev"
NODE_IMAGE="node:22-alpine"
DOCKER_BUILD_SHELL='rm -rf node_modules .next && npm ci --legacy-peer-deps && npm run build'

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "${REPOSITORY_SLUG}" ]] || die "REPOSITORY_SLUG is empty"
[[ -n "${VOLUME_DIR}" ]] || die "VOLUME_DIR is empty"
[[ -d "${PROJECT_DIR}" ]] || die "Project directory missing: ${PROJECT_DIR}"

cd "${PROJECT_DIR}"

# Multi-repo VPS: origin must use the per-slug SSH host alias when configured.
if git remote get-url origin >/dev/null 2>&1; then
  origin_url="$(git remote get-url origin)"
  if [[ "${origin_url}" == git@github.com:* && "${origin_url}" != git@github.com-tracking:* ]]; then
    log "AVISO: origin usa git@github.com sem alias — confira a Deploy Key."
  fi
fi

log "Updating repository (${BRANCH})"
# chmod/+x e CRLF sujam o working tree na VPS e bloqueiam pull --ff-only
git config core.fileMode false
git fetch origin "${BRANCH}"
git checkout -f "${BRANCH}"
git reset --hard "origin/${BRANCH}"
log "HEAD: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

log "Building with Docker (${NODE_IMAGE}) — host npm/node NOT required"
docker run --rm \
  -v "${PROJECT_DIR}:/app" \
  -w /app \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e RELEASE_CHANNEL=dev \
  "${NODE_IMAGE}" \
  sh -c "${DOCKER_BUILD_SHELL}"

[[ -f "${PROJECT_DIR}/.next/standalone/server.js" ]] \
  || die "Build did not produce .next/standalone/server.js (next.config output: standalone?)"

TMP_DIR="$(mktemp -d "/tmp/${REPOSITORY_SLUG}-build.XXXXXX")"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

log "Staging standalone + static + public + db in ${TMP_DIR}"
cp -a "${PROJECT_DIR}/.next/standalone/." "${TMP_DIR}/"
mkdir -p "${TMP_DIR}/.next"
rm -rf "${TMP_DIR}/.next/static"
cp -a "${PROJECT_DIR}/.next/static" "${TMP_DIR}/.next/static"
rm -rf "${TMP_DIR}/public"
cp -a "${PROJECT_DIR}/public" "${TMP_DIR}/public"
rm -rf "${TMP_DIR}/db"
cp -a "${PROJECT_DIR}/db" "${TMP_DIR}/db"

[[ -f "${TMP_DIR}/server.js" ]] || die "Staged server.js missing"

mkdir -p "${VOLUME_DIR}"

log "Publishing to volume ${VOLUME_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${TMP_DIR}/" "${VOLUME_DIR}/"
else
  log "rsync not found — using cp fallback (optional: apt-get install -y rsync)"
  STAGING_LIVE="${VOLUME_DIR}.incoming.$$"
  rm -rf "${STAGING_LIVE}"
  mkdir -p "${STAGING_LIVE}"
  cp -a "${TMP_DIR}/." "${STAGING_LIVE}/"
  find "${VOLUME_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "${STAGING_LIVE}/." "${VOLUME_DIR}/"
  rm -rf "${STAGING_LIVE}"
fi

[[ -f "${VOLUME_DIR}/server.js" ]] || die "Publish failed: ${VOLUME_DIR}/server.js missing"

# Auto-detect Swarm service — stack must already exist in Portainer UI.
SERVICE_NAME="$(docker service ls --format '{{.Name}}' | grep -E "${SERVICE_MATCH}" | head -n1 || true)"
if [[ -z "${SERVICE_NAME}" ]]; then
  die "No Swarm service matching ${SERVICE_MATCH} . Create the stack in Portainer UI first (name: royaltracking_<slug>). Never create/update the stack over SSH CLI."
fi

log "Updating Swarm service ${SERVICE_NAME} (auto-detected)"
docker service update --force "${SERVICE_NAME}"

log "Deploy completed successfully → ${PUBLIC_URL:-stack ${REPOSITORY_SLUG}}"
log "Script path: ${PROJECT_DIR}/ops/deploy.sh — stack edits only in Portainer UI"
