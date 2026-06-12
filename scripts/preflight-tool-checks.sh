#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
MISSING=()
for cmd in rg sed awk git node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING+=("$cmd")
  fi
done
if [ ${#MISSING[@]} -eq 0 ]; then
  echo "All required tools present"
  exit 0
fi
echo "Missing tools: ${MISSING[*]}" >&2
exit 2
