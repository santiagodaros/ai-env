# Seguridad

## Qué ejecuta este repo en tu máquina

Los plugins `guard`, `arch`, `dev-flow` y `cloud-ops` traen hooks: scripts de Node que Claude Code corre con tus permisos de usuario, fuera de cualquier sandbox. Antes de instalarlos, leelos; son cortos y están en `plugins/*/hooks/`.

Lo que cumplen hoy, y lo que se le exige a cualquier cambio:

- Sin dependencias: solo módulos estándar de Node. No hay `package.json` ni instalación de paquetes.
- Sin red: ningún hook abre conexiones. El único script que usa la red es `serve.cjs` de `front-studio`, un servidor local para el preview que solo corre cuando lo pedís.
- Solo leen la entrada del hook y archivos del proyecto. Lo que escriben fuera del repo:
  - `~/.claude/ai-env/statusline.cjs` y `~/.claude/.budget/` (la foto de consumo).
  - `~/.claude/ai-env/usage.jsonl`: una línea por cada bloqueo o pedido de confirmación, con fecha, hook, decisión e identificador de regla. No guarda comandos, rutas ni contenido. Se apaga con `AI_ENV_LOG=off` y se recorta solo al pasar 512 KB.
  - `~/.claude/settings.json`, únicamente cuando corrés el instalador o `/dev-flow:setup --apply`; deja una copia `.bak`.
- Los procesos que lanzan:
  - `git` y `node` (sus propios scripts).
  - `npm run typecheck|lint|test` del propio proyecto.
  - `terraform fmt` y `validate`, `bicep build` o `az bicep build`, y `pwsh` o `powershell` para analizar scripts, solo sobre archivos que cambiaron y solo si la herramienta está instalada (`iac-verify`). Ninguno aplica cambios ni se conecta a Azure.
  - `claude`, para consultar versión y sesiones activas, y para abrir una sesión cuando lo pedís con `feature-flow` y lo confirmás.
  - `serve.cjs` además abre el navegador.

El instalador (`install.ps1`, `install.sh`) solo llama a `claude plugin ...` y a los scripts `setup.cjs` y `doctor.cjs` del propio repo. Ejecutar un script bajado de internet sin leerlo es justo lo que `bash-guard` te hace confirmar: descargalo y leelo antes si no confiás en el origen.

Si instalás desde un fork, revisá el diff de `hooks/` y `scripts/` contra este repo.

## Qué no son

Los hooks son heurísticas sobre texto. Reducen errores; no son un control de seguridad. No reemplazan permisos mínimos en Azure, locks en los recursos, revisión humana ni escaneo de secretos en CI. Un comando ofuscado puede pasar `bash-guard`.

## Apagarlos

`AI_ENV_HOOKS=off` los apaga todos; `AI_ENV_HOOKS_SKIP=<nombre>` apaga uno. O deshabilitá el plugin: `claude plugin disable guard@ai-env`.

## Reportar un problema

Abrí un issue en el repo. Si el problema permite ejecutar código o filtrar secretos, no pongas el detalle en el issue: usá "Report a vulnerability" en la pestaña Security del repositorio.
