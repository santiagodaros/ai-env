#!/bin/sh
# Uso: ./bootstrap.sh [santiagodaros/ai-env] [plugin ...]
set -e
REPO="${1:-santiagodaros/ai-env}"; [ $# -gt 0 ] && shift
PLUGINS="${*:-guard dev-flow app-review cloud-ops front-studio}"
claude plugin marketplace add "$REPO"
for p in $PLUGINS; do claude plugin install "$p@ai-env"; done
claude plugin list
printf '\nListo. Dentro de Claude Code corré /dev-flow:setup (una vez por máquina) y /dev-flow:doctor.\n'
