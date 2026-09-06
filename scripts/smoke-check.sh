#!/usr/bin/env bash
# Usage: scripts/smoke-check.sh <deployed-url>
# Confirms the deployed URL returns HTTP 200 and renders the expected shell
# marker (DPLY-01). The marker string must match app/[locale]/page.tsx exactly.
set -euo pipefail

URL="${1:?Usage: scripts/smoke-check.sh <deployed-url>}"
MARKER="ASOBARCELONA"
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
