#!/usr/bin/env bash
# Ejecuta la suite E2E contra el stack local real. Las contraseñas NO viven en el repo:
# E2E_SECRETS_DIR debe contener admin.pw, compras.pw, computo.pw y jefe.pw.
set -euo pipefail
: "${E2E_SECRETS_DIR:?Definí E2E_SECRETS_DIR con los archivos *.pw}"
cd "$(dirname "$0")/.."
rd() { tr -d '\n' < "$E2E_SECRETS_DIR/$1"; }
export E2E_GERENCIA_EMAIL="${E2E_GERENCIA_EMAIL:-gerencia@demo.local}" E2E_GERENCIA_PASSWORD="$(rd admin.pw)"
export E2E_COMPRAS_EMAIL="${E2E_COMPRAS_EMAIL:-compras@demo.local}" E2E_COMPRAS_PASSWORD="$(rd compras.pw)"
export E2E_COMPUTO_EMAIL="${E2E_COMPUTO_EMAIL:-computo@demo.local}" E2E_COMPUTO_PASSWORD="$(rd computo.pw)"
export E2E_JEFE_OBRA_EMAIL="${E2E_JEFE_OBRA_EMAIL:-jefe@demo.local}" E2E_JEFE_OBRA_PASSWORD="$(rd jefe.pw)"
exec pnpm exec playwright test "$@"
