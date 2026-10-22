#!/usr/bin/env bash
# E2E reproducible: API standalone + web de producción + PostgreSQL aislado + seed sintético + Playwright.
# Uso: DATABASE_URL=postgresql://...@127.0.0.1:PORT/<base con "test"> apps/web/scripts/e2e-ci.sh [args playwright]
# Nunca apuntar a Railway ni a una base productiva: se exige host loopback y "test" en el nombre de la base.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requerida (base aislada de pruebas)}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["127.0.0.1","localhost"].includes(u.hostname)||!u.pathname.includes("test")){console.error("Base no aislada: se requiere loopback y nombre con test");process.exit(1)}'
SECRETS="${E2E_SECRETS_DIR:-$(mktemp -d)}"
mkdir -p "$SECRETS" && chmod 700 "$SECRETS"
export E2E_SECRETS_DIR="$SECRETS" E2E_BASE_URL=http://localhost:3000 NEXT_TELEMETRY_DISABLED=1
LOGS="${E2E_LOG_DIR:-$ROOT/apps/web/test-results/logs}"
mkdir -p "$LOGS"
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

cd "$ROOT"
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:deploy
if [ ! -f "$SECRETS/admin.pw" ]; then
  node -e 'process.stdout.write(require("node:crypto").randomBytes(18).toString("base64url"))' > "$SECRETS/admin.pw"
  chmod 600 "$SECRETS/admin.pw"
  BOOTSTRAP_ADMIN_EMAIL=gerencia@demo.local BOOTSTRAP_ADMIN_NAME="Gerencia Demo" BOOTSTRAP_ADMIN_PASSWORD="$(cat "$SECRETS/admin.pw")" pnpm --dir apps/api db:admin
fi

if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  pnpm --dir apps/api build
  API_BASE_URL=http://127.0.0.1:3001 pnpm --dir apps/web build
fi
# API en modo producción: cookies Secure; Chromium las acepta en http://localhost (contexto seguro).
(cd apps/api && NODE_ENV=production PORT=3001 HOSTNAME=127.0.0.1 APP_ORIGIN=http://localhost:3000 node .next/standalone/server.js > "$LOGS/api.log" 2>&1) & pids+=($!)
(cd apps/web && API_BASE_URL=http://127.0.0.1:3001 pnpm exec next start -p 3000 > "$LOGS/web.log" 2>&1) & pids+=($!)
for i in $(seq 60); do
  curl -sf http://127.0.0.1:3001/api/health >/dev/null && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/auth/me | grep -q 401 && break
  sleep 2
  [ "$i" = 60 ] && { echo "Servicios no disponibles"; tail -50 "$LOGS"/*.log; exit 1; }
done
node apps/web/scripts/e2e-seed.mjs
cd apps/web
bash scripts/e2e-local.sh "$@"
