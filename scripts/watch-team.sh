#!/bin/sh
set -e

if ! command -v fswatch >/dev/null 2>&1; then
  echo "fswatch is required. Install with: brew install fswatch" >&2
  exit 1
fi

fswatch -o *.template.html i18n team/en team/ko | while read -r _; do
  node scripts/build-team.mjs
  echo "[watch-team] Rebuilt site"
done
