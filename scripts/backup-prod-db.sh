#!/usr/bin/env sh
set -eu

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup-prod-db] pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is in PATH." >&2
  exit 127
fi

if [ -z "${DATABASE_URL:-}" ] && [ -z "${DB_HOST:-}" ] && [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

if [ -n "${DB_SSLMODE:-}" ] && [ -z "${PGSSLMODE:-}" ]; then
  export PGSSLMODE="$DB_SSLMODE"
fi

if [ -n "${DB_CHANNEL_BINDING:-}" ] && [ -z "${PGCHANNELBINDING:-}" ]; then
  export PGCHANNELBINDING="$DB_CHANNEL_BINDING"
fi

backup_file="backup-prod-$(date +%Y%m%d-%H%M%S).sql"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[backup-prod-db] Creating backup using DATABASE_URL..."
  pg_dump "$DATABASE_URL" > "$backup_file"
else
  : "${DB_HOST:?DB_HOST is required when DATABASE_URL is not set}"
  : "${DB_PORT:?DB_PORT is required when DATABASE_URL is not set}"
  : "${DB_USERNAME:?DB_USERNAME is required when DATABASE_URL is not set}"
  : "${DB_PASSWORD:?DB_PASSWORD is required when DATABASE_URL is not set}"
  : "${DB_NAME:?DB_NAME is required when DATABASE_URL is not set}"

  echo "[backup-prod-db] Creating backup using DB_* variables..."
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$DB_NAME" > "$backup_file"
fi

echo "[backup-prod-db] Backup completed: $backup_file"
