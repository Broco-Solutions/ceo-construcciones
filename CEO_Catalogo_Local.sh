#!/usr/bin/env bash
# Carga explícita, nunca desde el arranque ni desde requests. Solo entorno manual local.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
source "$HOME/.local/state/ceo-construcciones-codex/local.env"
set -a
source "$HOME/.local/state/ceo-construcciones-codex/manual/local.env"
set +a
node <<'NODE'
const u=new URL(process.env.DATABASE_URL||'');
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.pathname!=='/ceo_manual_test')throw Error('Destino manual local no confirmado');
NODE
[[ "$(docker inspect -f '{{index .Config.Labels "broco.ceo.purpose"}}' ceo-codex-tests)" == local-codex-tests-v1 ]] || exit 1
PORT="$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL).port)')"
[[ "$(docker port ceo-codex-tests 5432/tcp)" == "127.0.0.1:$PORT" ]] || exit 1
if [[ "${1:-}" == migrate ]]; then
  exec pnpm --dir apps/api db:deploy
fi
exec pnpm --dir apps/api exec tsx scripts/catalogo-ceo.ts "$@"
