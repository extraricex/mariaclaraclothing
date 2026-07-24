#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/deploy/production.env}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.production.yml"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_api() {
  local container_id health attempt=0
  container_id="$(compose ps -q api)"
  while (( attempt < 60 )); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
      echo "API failed its deployment health check: $health" >&2
      return 1
    fi
    sleep 1
    ((attempt += 1))
  done
  echo "API did not become healthy within 60 seconds." >&2
  return 1
}

cd "$ROOT_DIR"
compose config --quiet

# Build before touching the running services. Keep the existing web container
# available while PostgreSQL and API are updated, then perform the short nginx
# handover only after the new API is healthy.
compose build api web
# Refuse to replace a healthy release when configured SMTP credentials cannot
# authenticate. This catches revoked or mismatched Gmail app passwords before
# a customer order can become the first production failure signal.
compose run --rm --no-deps api node scripts/verify-smtp.js
compose up -d postgres
compose up -d --no-deps api
wait_for_api
compose up -d --no-deps --remove-orphans web
compose ps
