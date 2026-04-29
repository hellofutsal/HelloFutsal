#!/bin/sh

# Migration script for Render deployment
# This script runs database migrations before the application starts

echo "Starting database migrations..."

# Wait for database to be ready (important for Render's PostgreSQL)
echo "Waiting for database connection..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
  if npm run typeorm -- migration:show > /dev/null 2>&1; then
    echo "Database is ready!"
    break
  fi
  
  echo "Attempt $attempt/$max_attempts: Database not ready, waiting 2 seconds..."
  sleep 2
  attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "Error: Database connection failed after $max_attempts attempts"
  exit 1
fi

# Run migrations
echo "Running pending migrations..."
npm run migration:run

if [ $? -eq 0 ]; then
  echo "✅ Migrations completed successfully!"
else
  echo "❌ Migration failed!"
  exit 1
fi

echo "Migration process completed."
