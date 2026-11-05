#!/usr/bin/env bash
# Ejecutar MANUALMENTE en Ubuntu/WSL, fuera de Codex, desde la raíz del repo.
# Solo prepara desarrollo local. No hace commits, push, deploy ni migraciones.
set -Eeuo pipefail
umask 077
trap 'printf "\nERROR en la línea %s. Se conservan archivos y recursos creados; no se hizo limpieza destructiva.\n" "$LINENO" >&2' ERR
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

for tool in git tar node pnpm docker codex; do
  command -v "$tool" >/dev/null || fail "Falta $tool en esta terminal. No se instalará ni modificará el sistema automáticamente."
done
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
ORIGIN="$(git config --get remote.origin.url || true)"
case "$ORIGIN" in
  https://github.com/Broco-Solutions/ceo-construcciones|https://github.com/Broco-Solutions/ceo-construcciones.git|git@github.com:Broco-Solutions/ceo-construcciones.git|ssh://git@github.com/Broco-Solutions/ceo-construcciones.git) ;;
  *) fail 'Este no es el repositorio esperado de CEO Construcciones. No se modifica nada.' ;;
esac
printf 'Proyecto: %s\n' "$ROOT"
printf 'Node: %s · pnpm: %s\n' "$(node --version)" "$(pnpm --version)"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || fail 'El proyecto usa Node 24. Seleccioná esa versión en tu gestor (p. ej. nvm use 24) y repetí.'
[[ -s CEO_PLAN_UX_UI_TRANSVERSAL_CODEX.md ]] || fail 'Falta el plan vigente CEO_PLAN_UX_UI_TRANSVERSAL_CODEX.md.'
if [[ ! -s docs/ESTADO-PROYECTO.md ]]; then
  fail 'No aparece docs/ESTADO-PROYECTO.md: usá el árbol de trabajo donde Codex dejó el incremento. No reclones ni continúes sobre una copia sin esos cambios.'
fi

STATE="$HOME/.local/state/ceo-construcciones-codex"
[[ ! -L "$STATE" ]] || fail 'La ruta de estado es un enlace simbólico; revisar antes de continuar.'
mkdir -p "$STATE"
chmod 700 "$STATE"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
RECOVERY="$STATE/recovery-$STAMP"
mkdir -m 700 "$RECOVERY"
printf '\nConservando una copia LOCAL del trabajo actual, incluidos archivos nuevos...\n'
tar --exclude=node_modules --exclude=.next --exclude=.turbo \
    --exclude=test-results --exclude=playwright-report \
    -czf "$RECOVERY/worktree.tgz" -C "$ROOT" .
git status --short > "$RECOVERY/git-status.txt"
git rev-parse HEAD > "$RECOVERY/base-sha.txt"
printf 'Copia local: %s/worktree.tgz\n' "$RECOVERY"

GITDIR="$(git rev-parse --absolute-git-dir)"
PROBE="$(mktemp "$GITDIR/ceo-writecheck.XXXXXX")" || fail '.git tampoco es escribible desde tu terminal. No uses chmod 777: revisar propietario/montaje.'
rm -- "$PROBE"
BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" || "$BRANCH" == main || "$BRANCH" == master ]]; then
  BRANCH="codex/cierre-etapa1-$STAMP"
  git switch -c "$BRANCH"
fi
printf 'Git local escribible. Rama: %s (sin commit ni push).\n' "$BRANCH"
if ! git var GIT_AUTHOR_IDENT >/dev/null 2>&1; then
  printf 'AVISO: falta identidad Git; configurá tu nombre/email reales antes de commitear.\n'
fi

# Aceptar solamente un Docker local por socket Unix; nunca un contexto remoto.
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
elif [[ -n "${DOCKER_HOST:-}" ]]; then
  ENDPOINT="$DOCKER_HOST"
else
  ENDPOINT="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
fi
[[ "$ENDPOINT" == unix://* ]] || fail 'Docker apunta a un contexto remoto/no local. Seleccioná tu motor local antes de preparar pruebas.'
docker info >/dev/null 2>&1 || fail 'Docker local no responde. Si usás Docker Desktop, abrilo en Windows y habilitá Resources > WSL Integration > Ubuntu.'
NAME=ceo-codex-tests
ENVFILE="$STATE/local.env"
LABEL='broco.ceo.purpose'
VALUE='local-codex-tests-v1'

if docker container inspect "$NAME" >/dev/null 2>&1; then
  [[ "$(docker inspect -f '{{index .Config.Labels "broco.ceo.purpose"}}' "$NAME")" == "$VALUE" ]] || fail 'Ya existe un contenedor homónimo no creado por este preparador. No se toca.'
  [[ -f "$ENVFILE" && -O "$ENVFILE" && ! -L "$ENVFILE" ]] || fail 'Contenedor existente sin archivo local de credenciales verificable. No se borra ni reinicializa.'
  # Archivo generado por este preparador, fuera del repo y con permiso 600.
  source "$ENVFILE"
  [[ "${CEO_PG_CONTAINER:-}" == "$NAME" ]] || fail 'La configuración local no coincide con el contenedor.'
  [[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" == true ]] || docker start "$NAME" >/dev/null
else
  PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')"
  export POSTGRES_PASSWORD="$PASSWORD"
  printf '\nCreando PostgreSQL 18 exclusivo para tests; puerto de host automático en 127.0.0.1...\n'
  docker run --detach --name "$NAME" \
    --label "$LABEL=$VALUE" \
    --publish '127.0.0.1::5432' \
    --env POSTGRES_USER=ceo_test --env POSTGRES_DB=ceo_api_test \
    --env POSTGRES_PASSWORD postgres:18 >/dev/null
  unset POSTGRES_PASSWORD
  PORT="$(docker port "$NAME" 5432/tcp | awk -F: '/^127\.0\.0\.1:/ { print $NF; exit }')"
  [[ "$PORT" =~ ^[0-9]+$ ]] || fail 'No se pudo determinar el puerto local de PostgreSQL.'
  [[ ! -e "$ENVFILE" ]] || cp -p "$ENVFILE" "$STATE/previous-$STAMP.env"
  {
    printf '# Solo credenciales de una base LOCAL y desechable de pruebas. NO COMMIT.\n'
    printf 'export CEO_PG_CONTAINER=%q\n' "$NAME"
    printf 'export CEO_REPO_ROOT=%q\n' "$ROOT"
    printf 'export DATABASE_URL=%q\n' "postgresql://ceo_test:$PASSWORD@127.0.0.1:$PORT/ceo_api_test?connection_limit=3&pool_timeout=10"
    printf 'export APP_ORIGIN=%q\n' 'http://localhost:3000'
    printf 'export API_BASE_URL=%q\n' 'http://127.0.0.1:3001'
    printf 'export NEXT_TELEMETRY_DISABLED=1\n'
  } > "$ENVFILE"
  chmod 600 "$ENVFILE"
  unset PASSWORD
  source "$ENVFILE"
fi

READY=0
for _ in $(seq 60); do
  if docker exec "$NAME" pg_isready -U ceo_test -d ceo_api_test >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[[ "$READY" == 1 ]] || fail 'PostgreSQL no quedó disponible. Revisar únicamente los logs del contenedor de tests.'
# Verificar el destino sin imprimir credenciales.
node <<'NODE'
const u = new URL(process.env.DATABASE_URL);
if (u.protocol !== 'postgresql:' || u.hostname !== '127.0.0.1' || u.pathname !== '/ceo_api_test') {
  console.error('DATABASE_URL no identifica la base local esperada.'); process.exit(1);
}
console.log(`Base aislada disponible: ${u.hostname}:${u.port}${u.pathname} (credenciales ocultas)`);
NODE

printf '\nComprobando acceso a GitHub (solo lectura)...\n'
if command -v gh >/dev/null && gh auth status --hostname github.com >/dev/null 2>&1; then
  if [[ "$(gh api repos/Broco-Solutions/ceo-construcciones --jq '.permissions.push' 2>/dev/null || true)" == true ]]; then
    printf 'GitHub CLI autenticado con permiso push en el repo. Las protecciones de main siguen vigentes.\n'
  else
    printf 'AVISO: no se acreditó permiso push. Revisar acceso de la cuenta al repo antes del PR.\n'
  fi
else
  printf 'AVISO: falta GitHub CLI autenticado. Ejecutá gh auth login --hostname github.com --git-protocol https --web; luego gh auth setup-git --hostname github.com.\n'
fi
GIT_TERMINAL_PROMPT=0 git ls-remote --exit-code origin HEAD >/dev/null 2>&1 \
  && printf 'Lectura remota Git: OK.\n' \
  || printf 'AVISO: falta autenticar Git remoto o habilitar su conexión; no se hizo ningún push.\n'
printf '\nPREPARACIÓN LOCAL COMPLETADA. No se aplicaron migraciones ni se ejecutaron tests todavía.\n'
printf 'Entorno: %s\n' "$ENVFILE"
printf 'Próximo paso: source %q\n' "$ENVFILE"
printf 'Reanudar: codex resume --last --sandbox workspace-write --ask-for-approval on-request\n'
printf 'Solicitar aprobación puntual para Git, Docker o red cuando el sandbox lo requiera.\n'
