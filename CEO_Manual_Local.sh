#!/usr/bin/env bash
# Entorno manual persistente. No resetea bases ni usa servicios cloud.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
source "$HOME/.local/state/ceo-construcciones-codex/local.env"
exec pnpm --dir apps/api exec tsx scripts/manual-local.ts "${1:-start}"
