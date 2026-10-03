#!/bin/sh
# Uso: ./bootstrap.sh [santiagodaros/ai-env] [plugin ...]
set -e
REPO="${1:-santiagodaros/ai-env}"; [ $# -gt 0 ] && shift
PLUGINS="${*:-front-studio app-review cloud-ops}"
claude plugin marketplace add "$REPO"
for p in $PLUGINS; do claude plugin install "$p@ai-env"; done
claude plugin list
