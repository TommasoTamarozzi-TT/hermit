#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <free|cheap|workhorse|heavy> <command...>" >&2
  exit 1
fi

tier="$1"
shift

case "$tier" in
  free)
    model="local/gemma4"
    fallback="openai/gpt-4.1-mini"
    ;;
  cheap)
    model="openai/gpt-4.1-mini"
    fallback="openai/gpt-5-mini"
    ;;
  workhorse|standard)
    model="openai/gpt-5-mini"
    fallback="openai/gpt-4.1-mini"
    ;;
  heavy|expensive)
    model="openai/gpt-5.4"
    fallback="openai/gpt-5-mini"
    ;;
  *)
    echo "Unknown model tier: $tier" >&2
    exit 1
    ;;
esac

echo "[model-tier] ${tier} -> ${model} (fallback: ${fallback})" >&2
exec env ROLE_AGENT_MODEL="$model" ROLE_AGENT_FALLBACK_MODELS="$fallback" "$@"
