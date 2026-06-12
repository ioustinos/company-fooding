#!/usr/bin/env bash
# Orexis Event Builder — isolated, auth-free Netlify deploy.
# Run from this folder on a machine that's logged into Netlify.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...      # the key the function will use
#   ./deploy.sh                              # builds, creates the site, sets the key, deploys
set -euo pipefail

SITE_NAME="${SITE_NAME:-orexis-event-builder}"
NETLIFY="npx --yes netlify-cli"

echo "→ Installing deps + building…"
npm install
npm run build

echo "→ Netlify login (a browser tab opens the first time)…"
$NETLIFY login || true

echo "→ Ensuring site '$SITE_NAME' exists and is linked…"
$NETLIFY sites:create --name "$SITE_NAME" 2>/dev/null || true
$NETLIFY link --name "$SITE_NAME"

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "→ Setting ANTHROPIC_API_KEY on the site…"
  $NETLIFY env:set ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY" >/dev/null
else
  echo "!! ANTHROPIC_API_KEY is not set in your shell."
  echo "   The site will deploy but the chat will 500 until you add it:"
  echo "   Netlify UI → Site settings → Environment variables → ANTHROPIC_API_KEY"
fi

echo "→ Deploying to production…"
$NETLIFY deploy --build --prod

echo "✓ Done — the production URL is printed above."
