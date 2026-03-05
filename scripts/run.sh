#!/usr/bin/env bash
# ChainPilot — single execution cycle
# Usage: bash scripts/run.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "  [DRY RUN] No transactions will be broadcast."
fi

export DRY_RUN

exec npx tsx src/index.ts
