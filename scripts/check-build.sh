#!/usr/bin/env bash
# Garde-fou pré-Publish : build prod → vite preview → Playwright smoke test
# Usage : npm run check-build
# Exit 0 = OK, exit 1 = BLOQUER le Publish
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=4174
PREVIEW_PID=""

cleanup() {
  if [ -n "$PREVIEW_PID" ]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "🔨  Build de prod..."
cd "$REPO_DIR"
npm run build 2>&1 | tail -20

echo ""
echo "🚀  Démarrage vite preview (port $PORT)..."
npm run preview -- --port "$PORT" --host &
PREVIEW_PID=$!

# Attendre que le serveur réponde (max 20 s)
TRIES=0
until curl -s "http://localhost:$PORT" > /dev/null 2>&1; do
  sleep 1
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge 20 ]; then
    echo "❌  vite preview n'a pas démarré dans les temps" >&2
    exit 1
  fi
done

echo "✅  Serveur prêt (${TRIES}s). Lancement des checks Playwright..."
npx playwright test --config playwright.check-build.config.ts

echo ""
echo "✅  Garde-fou PASSÉ — tu peux Publier sur Lovable."
