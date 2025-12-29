#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required to run the OG renderer."
  exit 1
fi

node "$ROOT_DIR/scripts/render-og.mjs" "$@"
