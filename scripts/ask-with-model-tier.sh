#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <free|cheap|workhorse|heavy> <role-id> <prompt...>" >&2
  exit 1
fi

tier="$1"
role_id="$2"
shift 2

cd /home/rva/repos/hermit
./scripts/with-model-tier.sh "$tier" ./scripts/with-local-npm.sh ./scripts/with-provider-env.sh npm run -s cli -- ask --role "$role_id" "$@"
