#!/usr/bin/env bash
# Prepara el entorno de pruebas del agente QA: reinicia el Supabase LOCAL (Docker),
# siembra datos de prueba y deja la app en http://localhost:3000 con NODE_ENV=test.
# Nunca toca el proyecto real: aborta si .env.test.local no apunta a 127.0.0.1.
#
# Uso:  bash qa/start.sh            (reinicia, siembra y arranca la app en primer plano)
#       bash qa/start.sh --no-app   (solo reinicia y siembra; arranca la app tú: NODE_ENV=test npm run dev)
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/e2e/setup-local-supabase.sh

if ! grep -q '^NEXT_PUBLIC_SUPABASE_URL=.*127\.0\.0\.1' .env.test.local; then
  echo "ABORTO: .env.test.local no apunta al Supabase local." >&2
  exit 1
fi

node --env-file=.env.test.local qa/seed.mjs

if [[ "${1:-}" == "--no-app" ]]; then
  echo "Listo. Arranca la app con:  NODE_ENV=test npm run dev"
  exit 0
fi
echo "Arrancando la app en http://localhost:3000 (Ctrl+C para detener)..."
NODE_ENV=test npm run dev
