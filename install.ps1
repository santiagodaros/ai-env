# Instalador de ai-env para Windows (PowerShell 5.1 o superior). Un comando y queda todo:
#   irm https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.ps1 | iex
# Se puede volver a correr: actualiza en vez de duplicar.
# Opciones por variable de entorno (definilas antes de correrlo):
#   $env:AI_ENV_PLUGINS = 'guard dev-flow'   que plugins instalar (por defecto, los seis)
#   $env:AI_ENV_NO_SETUP = '1'               no tocar ~\.claude\settings.json (statusline y actualizacion automatica)
#   $env:AI_ENV_FORCE_STATUSLINE = '1'       reemplazar una statusline que ya tengas
#   $env:AI_ENV_SOURCE = 'usuario/repo'      instalar desde un fork o una carpeta local
$ErrorActionPreference = 'Stop'
$source = if ($env:AI_ENV_SOURCE) { $env:AI_ENV_SOURCE } else { 'santiagodaros/ai-env' }
$plugins = if ($env:AI_ENV_PLUGINS) { $env:AI_ENV_PLUGINS -split '[ ,]+' | Where-Object { $_ } } else { 'guard', 'arch', 'dev-flow', 'app-review', 'cloud-ops', 'front-studio' }
function Say($t) { Write-Host "`n== $t" }
function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Falta $cmd. $hint" } }
function Run { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; $exe = $args[0]; $rest = @($args | Select-Object -Skip 1); $out = & $exe @rest 2>&1 | ForEach-Object { "$_" }; $code = $LASTEXITCODE; $ErrorActionPreference = $old; $out | ForEach-Object { Write-Host $_ }; if ($code -ne 0) { throw "Fallo ($code): $($args -join ' ') :: $($out -join ' ')" } }
function Try-Run { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; $exe = $args[0]; $rest = @($args | Select-Object -Skip 1); try { & $exe @rest 2>&1 | Out-Null } catch { } finally { $ErrorActionPreference = $old }; $global:LASTEXITCODE = 0 }

Say 'Requisitos'
Need node 'Instala Node.js 18 o superior: https://nodejs.org'
Need git 'Instala git: https://git-scm.com'
Need claude 'Instala Claude Code: https://code.claude.com/docs/en/setup'
node -e 'process.exit(Number(process.versions.node.split(String.fromCharCode(46))[0]) >= 18 ? 0 : 1)'
if ($LASTEXITCODE -ne 0) { throw "Node $(node -v) es viejo: hace falta 18 o superior." }
Write-Host "node $(node -v) - $(git --version) - claude $((claude --version | Select-Object -First 1))"

Say 'Marketplace'
Run claude plugin marketplace add $source
Try-Run claude plugin marketplace update ai-env

Say 'Plugins'
foreach ($p in $plugins) {
  Run claude plugin install "$p@ai-env"
  Try-Run claude plugin update "$p@ai-env"
}

$devflow = $null
try {
  $list = (claude plugin list --json | Out-String | ConvertFrom-Json)
  $d = $list | Where-Object { $_.id -eq 'dev-flow@ai-env' } | Select-Object -First 1
  if ($d) { $devflow = if ($d.readFromFolder) { $d.readFromFolder } else { $d.installPath } }
} catch { }
$setup = if ($devflow) { Join-Path $devflow 'skills/setup/scripts/setup.cjs' } else { $null }
if ($setup -and (Test-Path $setup)) {
  if (-not $env:AI_ENV_NO_SETUP) {
    Say 'Statusline y actualizacion automatica'
    if ($env:AI_ENV_FORCE_STATUSLINE) { Run node $setup --apply --force-statusline } else { Run node $setup --apply }
  }
  Say 'Diagnostico'
  node (Join-Path $devflow 'skills/doctor/scripts/doctor.cjs')
  $global:LASTEXITCODE = 0
} else {
  Write-Host 'dev-flow no esta instalado: se saltean la statusline y el diagnostico.'
}

Say 'Listo'
Write-Host 'Reinicia Claude Code. En cada repo, una vez: /dev-flow:project-init'
Write-Host 'Para actualizar o reparar, volve a correr este instalador.'
