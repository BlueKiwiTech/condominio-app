#!/usr/bin/env bash
# Resets the local Supabase stack to a clean, migration-only state and seeds
# the one admin account the E2E suite logs in as. Never touches the live
# project -- .env.test.local (written below) is what points `next dev` at
# this local stack instead, via NODE_ENV=test (see playwright.config.ts).
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running -- start Docker Desktop first." >&2
  exit 1
fi

if ! supabase status >/dev/null 2>&1; then
  supabase start
fi

supabase db reset

ENV_FILE=".env.test.local"
E2E_ADMIN_EMAIL="e2e-admin@asobarcelona.test"
E2E_ADMIN_PASSWORD="e2e-password-123"

supabase status -o env \
  | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' \
  | sed -e 's/^API_URL=/NEXT_PUBLIC_SUPABASE_URL=/' \
        -e 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/' \
        -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/' \
  > "$ENV_FILE"
{
  echo "E2E_ADMIN_EMAIL=$E2E_ADMIN_EMAIL"
  echo "E2E_ADMIN_PASSWORD=$E2E_ADMIN_PASSWORD"
} >> "$ENV_FILE"

node --env-file="$ENV_FILE" scripts/seed-admin.mjs "$E2E_ADMIN_EMAIL" "$E2E_ADMIN_PASSWORD"

echo "Local Supabase ready for E2E. Wrote $ENV_FILE."
