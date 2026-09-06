#!/usr/bin/env bash
# Usage: scripts/smoke-check.sh <deployed-url>
# Confirms the deployed URL returns HTTP 200 and renders the expected page
# (DPLY-01). Root now redirects to /login for anonymous visitors (see
# app/[locale]/page.tsx), so the marker checks for /login's own heading
# instead of the old static homepage text.
set -euo pipefail

URL="${1:?Usage: scripts/smoke-check.sh <deployed-url>}"
MARKER="Iniciar sesión"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

STATUS=$(curl -sL -o "$BODY_FILE" -w "%{http_code}" "$URL")

if [ "$STATUS" != "200" ]; then
  echo "FAIL: expected HTTP 200 from $URL, got $STATUS"
  exit 1
fi

if ! grep -q "$MARKER" "$BODY_FILE"; then
  echo "FAIL: marker '$MARKER' not found in response body from $URL"
  exit 1
fi

echo "PASS: $URL returned 200 and contains marker '$MARKER'"
