#!/usr/bin/env bash
# Naming padrão Royal Tracking — source este arquivo nos scripts de setup/deploy.
# Prefixo: royaltracking_<slug-do-projeto>
#
# Ex.: projeto "Fizzing Marketing" → royaltracking_fizzing_marketing
#      stack, serviço, volume, DB e user Postgres usam o mesmo prefixo.

royal_tracking_slugify() {
  local raw="${1:-}"
  echo "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//; s/_+/_/g' \
    | cut -c1-48
}

# Define variáveis globais a partir do slug (ou do nome bruto).
# Uso: royal_tracking_set_names "fizzing"   OU   royal_tracking_set_names_from_label "Fizzing"
royal_tracking_set_names() {
  local slug
  slug="$(royal_tracking_slugify "${1:-}")"
  if [[ -z "$slug" ]]; then
    echo "Nome do projeto inválido (use letras/números)." >&2
    return 1
  fi

  PROJECT_SLUG="$slug"
  INSTANCE_PREFIX="royaltracking_${PROJECT_SLUG}"
  STACK_NAME="${INSTANCE_PREFIX}"
  SERVICE_KEY="app"
  SERVICE_NAME="${STACK_NAME}_${SERVICE_KEY}"
  ROUTER_NAME="${INSTANCE_PREFIX}"
  VOLUME_NAME="${INSTANCE_PREFIX}"
  VOLUME_DATA="/var/lib/docker/volumes/${VOLUME_NAME}/_data"
  PROJECT_DIR="/root/projects/${INSTANCE_PREFIX}"
  PG_DB="${INSTANCE_PREFIX}"
  PG_USER="${INSTANCE_PREFIX}"
  INSTANCE_FILE="${PROJECT_DIR}/.instance"
}

royal_tracking_write_instance_file() {
  local domain="${1:-}"
  local pg_host="${2:-}"
  mkdir -p "$(dirname "$INSTANCE_FILE")"
  cat > "$INSTANCE_FILE" <<EOF
# Gerado pelo setup — não editar à mão sem necessidade
PROJECT_SLUG=${PROJECT_SLUG}
INSTANCE_PREFIX=${INSTANCE_PREFIX}
STACK_NAME=${STACK_NAME}
SERVICE_KEY=${SERVICE_KEY}
SERVICE_NAME=${SERVICE_NAME}
ROUTER_NAME=${ROUTER_NAME}
VOLUME_NAME=${VOLUME_NAME}
VOLUME_DATA=${VOLUME_DATA}
PROJECT_DIR=${PROJECT_DIR}
PG_DB=${PG_DB}
PG_USER=${PG_USER}
PG_HOST=${pg_host}
DOMAIN=${domain}
EOF
  chmod 600 "$INSTANCE_FILE"
}

royal_tracking_load_instance() {
  local file="${1:-.instance}"
  if [[ ! -f "$file" ]]; then
    echo "Arquivo de instância não encontrado: $file" >&2
    echo "Rode install.sh / bootstrap-vps.sh primeiro." >&2
    return 1
  fi
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}
