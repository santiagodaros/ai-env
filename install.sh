#!/bin/sh
# Instalador de ai-env para macOS y Linux. Un comando y queda todo:
#   curl -fsSL https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.sh | sh
# Se puede volver a correr: actualiza en vez de duplicar.
# Opciones por variable de entorno:
#   AI_ENV_PROFILE=core               perfil: core, app, cloud, frontend o full (por defecto, full: los siete)
#   AI_ENV_PLUGINS="guard dev-flow"   lista explícita de plugins; si está definida, gana sobre el perfil
#   AI_ENV_DRY_RUN=1                  solo mostrar qué plugins instalaría, sin tocar nada
#   AI_ENV_NO_SETUP=1                 no tocar ~/.claude/settings.json (statusline y actualización automática)
#   AI_ENV_FORCE_STATUSLINE=1         reemplazar una statusline que ya tengas
#   AI_ENV_SOURCE=usuario/repo        instalar desde un fork o una carpeta local
set -e
SOURCE="${AI_ENV_SOURCE:-santiagodaros/ai-env}"
PROFILE="${AI_ENV_PROFILE:-full}"
# Copia literal de shared/profiles.json (tests/profiles.cjs verifica que coincidan).
case "$PROFILE" in
  core) PROFILE_PLUGINS="guard arch dev-flow idea-lab" ;;
  app) PROFILE_PLUGINS="guard arch dev-flow idea-lab app-review" ;;
  cloud) PROFILE_PLUGINS="guard arch dev-flow idea-lab cloud-ops" ;;
  frontend) PROFILE_PLUGINS="guard arch dev-flow idea-lab app-review front-studio" ;;
  full) PROFILE_PLUGINS="guard arch dev-flow idea-lab app-review cloud-ops front-studio" ;;
  *) printf 'Perfil desconocido: %s. Usá core, app, cloud, frontend o full.\n' "$PROFILE" >&2; exit 1 ;;
esac
if [ -n "$AI_ENV_PLUGINS" ]; then PLUGINS="$AI_ENV_PLUGINS"; ORIGIN="AI_ENV_PLUGINS"; else PLUGINS="$PROFILE_PLUGINS"; ORIGIN="perfil $PROFILE"; fi
if [ -n "$AI_ENV_DRY_RUN" ]; then printf 'Plugins (%s): %s\n' "$ORIGIN" "$PLUGINS"; exit 0; fi
say() { printf '\n== %s\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1 || { printf 'Falta %s. %s\n' "$1" "$2" >&2; exit 1; }; }

say "Requisitos"
need node "Instalá Node.js 18 o superior: https://nodejs.org"
need git "Instalá git: https://git-scm.com"
need claude "Instalá Claude Code: https://code.claude.com/docs/en/setup"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || { echo "Node $(node -v) es viejo: hace falta 18 o superior." >&2; exit 1; }
echo "node $(node -v) · $(git --version) · claude $(claude --version 2>/dev/null | head -n 1)"

say "Marketplace"
claude plugin marketplace add "$SOURCE"
claude plugin marketplace update ai-env >/dev/null 2>&1 || true

say "Plugins ($ORIGIN)"
for p in $PLUGINS; do
  claude plugin install "$p@ai-env"
  claude plugin update "$p@ai-env" >/dev/null 2>&1 || true
done

DEVFLOW="$(claude plugin list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const p=JSON.parse(s).find(x=>x.id==="dev-flow@ai-env");process.stdout.write(p?(p.readFromFolder||p.installPath||""):"")}catch{}})')"
if [ -n "$DEVFLOW" ] && [ -f "$DEVFLOW/skills/setup/scripts/setup.cjs" ]; then
  if [ -z "$AI_ENV_NO_SETUP" ]; then
    say "Statusline y actualización automática"
    node "$DEVFLOW/skills/setup/scripts/setup.cjs" --apply ${AI_ENV_FORCE_STATUSLINE:+--force-statusline}
  fi
  say "Diagnóstico"
  node "$DEVFLOW/skills/doctor/scripts/doctor.cjs" || true
else
  echo "dev-flow no está instalado: se saltean la statusline y el diagnóstico."
fi

say "Listo"
echo "Reiniciá Claude Code. En cada repo, una vez: /dev-flow:init (activa solo los plugins del perfil de ese repo)"
echo "Para actualizar o reparar, volvé a correr este instalador."
