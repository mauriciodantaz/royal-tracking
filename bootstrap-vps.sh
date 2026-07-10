#!/usr/bin/env bash
# Compat: redireciona para install.sh (padrão royaltracking_<projeto>).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "bootstrap-vps.sh → install.sh (naming royaltracking_<projeto>)"
exec bash "${SCRIPT_DIR}/install.sh" "$@"
