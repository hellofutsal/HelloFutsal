#!/usr/bin/env sh
set -eu

echo "[reset-db] Stopping containers and removing DB volume..."
docker compose down -v --remove-orphans

echo "[reset-db] Starting fresh postgres container..."
docker compose up -d db

echo "[reset-db] Waiting for postgres to become healthy..."
# Wait up to ~60s
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{json .State.Health.Status}}' "$(docker compose ps -q db)" 2>/dev/null || true)
  if [ "$status" = '"healthy"' ]; then
    echo "[reset-db] Postgres is healthy."
    break
  fi

  if [ "$i" -eq 30 ]; then
    echo "[reset-db] Timed out waiting for postgres health." >&2
    exit 1
  fi

  sleep 2
done

echo "[reset-db] Running migrations..."
npm run migration:run

echo "[reset-db] Done. Database is fresh and migrated."
