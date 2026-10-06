# Instala el marketplace ai-env y sus plugins. Uso: .\bootstrap.ps1 [-Repo santiagodaros/ai-env] [-Plugins guard,dev-flow]
param([string]$Repo = 'santiagodaros/ai-env', [string[]]$Plugins = @('guard','dev-flow','app-review','cloud-ops','front-studio'))
$ErrorActionPreference = 'Stop'
claude plugin marketplace add $Repo
foreach ($p in $Plugins) { claude plugin install "$p@ai-env" }
claude plugin list
Write-Host "`nListo. Dentro de Claude Code corré /dev-flow:setup (una vez por máquina) y /dev-flow:doctor."
