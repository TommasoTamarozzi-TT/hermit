#!/usr/bin/env bash
# Quick smoke runner: run a single Head-of-Operations heartbeat using the existing helper
set -euo pipefail
node --import tsx scripts/run-single-heartbeat.ts
