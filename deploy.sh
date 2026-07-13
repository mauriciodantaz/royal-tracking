#!/usr/bin/env bash
# Compat: entrypoint oficial é ops/deploy.sh (padrão Git to VPS).
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "AVISO: use /root/projects/tracking/ops/deploy.sh — redirecionando."
exec bash "${SCRIPT_DIR}/ops/deploy.sh" "$@"
