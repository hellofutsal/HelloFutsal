#!/usr/bin/env sh
set -eu

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[reset-prod-db] pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is in PATH." >&2
  exit 127
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[reset-prod-db] psql not found. Install PostgreSQL client tools and ensure psql is in PATH." >&2
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

if [ "${RESET_PROD_CONFIRM:-}" != "RESET_PROD" ]; then
  echo "[reset-prod-db] Refusing to run. Set RESET_PROD_CONFIRM=RESET_PROD to continue." >&2
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[reset-prod-db] Taking backup with DATABASE_URL..."
  pg_dump "$DATABASE_URL" > "backup-before-prod-reset-$(date +%Y%m%d-%H%M%S).sql"

  echo "[reset-prod-db] Dropping and recreating public schema..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
else
  : "${DB_HOST:?DB_HOST is required when DATABASE_URL is not set}"
  : "${DB_PORT:?DB_PORT is required when DATABASE_URL is not set}"
  : "${DB_USERNAME:?DB_USERNAME is required when DATABASE_URL is not set}"
  : "${DB_PASSWORD:?DB_PASSWORD is required when DATABASE_URL is not set}"
  : "${DB_NAME:?DB_NAME is required when DATABASE_URL is not set}"

  echo "[reset-prod-db] Taking backup with DB_* variables..."
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$DB_NAME" > "backup-before-prod-reset-$(date +%Y%m%d-%H%M%S).sql"

  echo "[reset-prod-db] Dropping and recreating public schema..."
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fi

echo "[reset-prod-db] Running migrations..."
npm run migration:run

echo "[reset-prod-db] Done. Production database reset completed."
