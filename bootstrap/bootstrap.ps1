# Instala el marketplace ai-env y sus plugins. Uso: .\bootstrap.ps1 [-Repo santiagodaros/ai-env] [-Plugins front-studio,app-review]
param([string]$Repo = 'santiagodaros/ai-env', [string[]]$Plugins = @('front-studio','app-review','cloud-ops'))
$ErrorActionPreference = 'Stop'
claude plugin marketplace add $Repo
foreach ($p in $Plugins) { claude plugin install "$p@ai-env" }
claude plugin list
