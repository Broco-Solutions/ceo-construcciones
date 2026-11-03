#!/usr/bin/env bash
# Comandos de comprobación aislados. No aplica nada a producción.
# Uso: bash CEO_Verificar_Local.sh api | web | e2e
# Cada ejecución api/e2e crea su propia base test; no reutiliza una base con usuarios.
set -Eeuo pipefail
umask 077
MODE="${1:-}"
[[ "$MODE" == api || "$MODE" == web || "$MODE" == e2e ]] || { echo 'Uso: bash CEO_Verificar_Local.sh api|web|e2e' >&2; exit 2; }
STATE="$HOME/.local/state/ceo-construcciones-codex"
ENVFILE="$STATE/local.env"
[[ -f "$ENVFILE" && -O "$ENVFILE" && ! -L "$ENVFILE" ]] || { echo 'Ejecutá primero CEO_Preparar_Local.sh en la terminal del usuario.' >&2; exit 1; }
source "$ENVFILE"
cd "$CEO_REPO_ROOT"
node <<'NODE'
const u = new URL(process.env.DATABASE_URL);
if (u.protocol !== 'postgresql:' || u.hostname !== '127.0.0.1' || u.pathname !== '/ceo_api_test') {
  console.error('No se permite usar esta conexión para pruebas.'); process.exit(1);
}
NODE
# Revalidar el Docker local y el contenedor exclusivo antes de crear bases.
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
elif [[ -n "${DOCKER_HOST:-}" ]]; then
  ENDPOINT="$DOCKER_HOST"
else
  ENDPOINT="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
fi
[[ "$ENDPOINT" == unix://* ]] || { echo 'Se requiere Docker local por socket Unix.' >&2; exit 1; }
[[ "$CEO_PG_CONTAINER" == ceo-codex-tests ]] || exit 1
[[ "$(docker inspect -f '{{index .Config.Labels "broco.ceo.purpose"}}' "$CEO_PG_CONTAINER")" == local-codex-tests-v1 ]] || exit 1
[[ "$(docker inspect -f '{{.State.Running}}' "$CEO_PG_CONTAINER")" == true ]] || docker start "$CEO_PG_CONTAINER" >/dev/null
READY=0
for _ in $(seq 60); do
  if docker exec "$CEO_PG_CONTAINER" pg_isready -U ceo_test -d ceo_api_test >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[[ "$READY" == 1 ]] || { echo 'PostgreSQL local no está disponible.' >&2; exit 1; }
PORT="$(docker port "$CEO_PG_CONTAINER" 5432/tcp | awk -F: '/^127\.0\.0\.1:/ { print $NF; exit }')"
[[ "$PORT" == "$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL).port)')" ]] || { echo 'La conexión no coincide con el puerto publicado del contenedor de tests.' >&2; exit 1; }
RUN="$(date +%Y%m%d_%H%M%S)_$$"
LOGDIR="$STATE/logs/$RUN-$MODE"
mkdir -p "$LOGDIR"
trap 'echo "Falló una comprobación. Logs locales: $LOGDIR" >&2' ERR
run() {
  local label="$1"; shift
  printf '\n=== %s ===\n' "$label"
  "$@" 2>&1 | tee "$LOGDIR/$label.log"
}

if [[ "$MODE" == api || "$MODE" == e2e ]]; then
  DB="ceo_${MODE}_test_$RUN"
  docker exec "$CEO_PG_CONTAINER" createdb -U ceo_test "$DB"
  export CEO_TEST_DB_NAME="$DB"
  DATABASE_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.env.CEO_TEST_DB_NAME;process.stdout.write(u.toString())')"
  export DATABASE_URL
fi
unset RUN_INTEGRATION RUN_RUNTIME E2E_SKIP_BUILD
if [[ "$MODE" == api ]]; then
  run prisma-generate pnpm --dir apps/api db:generate
  run migrations pnpm --dir apps/api db:deploy
  run api-types pnpm --dir apps/api typecheck
  run api-tests env RUN_INTEGRATION=1 pnpm --dir apps/api test
  run api-build pnpm --dir apps/api build
  run api-runtime pnpm --dir apps/api test:runtime
elif [[ "$MODE" == web ]]; then
  run web-types pnpm --dir apps/web typecheck
  run web-tests pnpm --dir apps/web test
  run web-build pnpm --dir apps/web build
else
  # No matar procesos ajenos ni permitir que una app ya abierta falsee el healthcheck.
  node <<'NODE'
const net=require('node:net');
(async()=>{for(const port of [3000,3001]){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error(`El puerto ${port} está ocupado. Cerrá solo el servidor local que conozcas.`)));s.listen(port,()=>s.close(resolve));});}})().catch(e=>{console.error(e.message);process.exit(1);});
NODE
  export E2E_SECRETS_DIR="$LOGDIR/e2e-secrets" E2E_LOG_DIR="$LOGDIR/services"
  mkdir -m 700 "$E2E_SECRETS_DIR"
  # Dejar E2E_SKIP_BUILD=0: este ciclo acredita builds del código ACTUAL.
  run e2e env E2E_SKIP_BUILD=0 bash apps/web/scripts/e2e-ci.sh
fi
printf '\nCOMPROBACIÓN %s FINALIZADA CON CÓDIGO 0. Logs: %s\n' "$MODE" "$LOGDIR"
printf 'No se borraron bases ni recursos. Son datos sintéticos locales; no publicar logs sin revisar.\n'
