---
name: project-init
description: >-
  Arranca un repo nuevo o recién clonado con las mismas bases: detecta el stack y los scripts reales, completa CLAUDE.md, docs/STATE.md y .gitignore sin pisar nada, deja declarados los plugins del repo y encadena arch-first para definir la arquitectura antes de escribir código. Se invoca a mano con /dev-flow:project-init en la raíz del repo.
disable-model-invocation: true
argument-hint: "[qué se va a construir, opcional]"
allowed-tools: Bash(node *skills/project-init/scripts/detect.cjs*) Bash(node *skills/project-init/scripts/init.cjs*)
---

# project-init

Proyecto: $ARGUMENTS

1. **Detectar.** `node "${CLAUDE_PLUGIN_ROOT}/skills/project-init/scripts/detect.cjs"`. Devuelve lenguajes, frameworks, gestor de paquetes, scripts reales (`typecheck`, `lint`, `test`, `build`), tipo de arquitectura sugerido y qué falta.
2. **Plugins del repo.** Si `projectPlugins` no incluye `guard@ai-env`, `arch@ai-env` y `dev-flow@ai-env`, proponé declararlos para todo el que clone el repo: `init.cjs --settings` (paso 3). Con eso cargan solos al confiar en la carpeta; no hay nada que copiar.
3. **Bases del repo.** `node "${CLAUDE_PLUGIN_ROOT}/skills/project-init/scripts/init.cjs"` (simulación) y, con el visto bueno, `--apply`. Crea `docs/STATE.md`, completa `.gitignore` y agrega a `CLAUDE.md` un bloque de comandos con los scripts que **existen**. Con `--settings` declara el marketplace y los plugins en `.claude/settings.json`; con `--ci` agrega los workflows de arquitectura y seguridad y dependabot. Nunca pisa texto existente.
4. **Huecos.** Si faltan `typecheck`, `lint` o `test`, decilo: sin ellos `stop-verify` y `feature-close` no verifican nada. Proponé crearlos como primera feature; no los inventes.
5. **Arquitectura.** Si no hay `architecture.json`, seguí con `arch:arch-first` usando el tipo sugerido (si dice `web+api`, una arquitectura por app). Hasta que la persona la apruebe no se escribe código.
6. **Primeras decisiones.** Registrá con `arch:adr` las decisiones de stack que el usuario confirme (gestor de paquetes, framework, despliegue).
7. Resumí en pocas líneas qué quedó hecho y qué falta, sin repetir los archivos.

## Reglas
- No inventes comandos ni versiones: todo sale de `detect.cjs` o de lo que diga el usuario.
- Sin nombres de cliente ni datos de tenant en ningún archivo versionado.
