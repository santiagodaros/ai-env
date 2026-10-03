---
name: project-init
description: >-
  Arranca un repo nuevo o recién clonado con las mismas bases: detecta el stack y los scripts reales, completa CLAUDE.md, docs/STATE.md y .gitignore sin pisar nada, verifica que el kit esté instalado y encadena arch-first para definir la arquitectura antes de escribir código. Se invoca a mano con /project-init en la raíz del repo.
disable-model-invocation: true
argument-hint: "[qué se va a construir, opcional]"
---

# project-init

Proyecto: $ARGUMENTS

1. **Detectar.** `node <base>/scripts/detect.cjs` (ruta base: la que muestra "Base directory for this skill"). Devuelve lenguajes, frameworks, gestor de paquetes, scripts reales (`typecheck`, `lint`, `test`, `build`), tipo de arquitectura sugerido y qué falta.
2. **Kit.** Si `hasKitHooks` es `false`, avisale al usuario que instale el kit en este repo: `node <ruta-del-kit>/install.js --repo .` (el kit está en `kits/hub-ai-kit` del repo `ai-env`). No copies hooks a mano.
3. **Bases del repo.** `node <base>/scripts/init.cjs` (simulación) y, con el visto bueno, `--apply`. Crea `docs/STATE.md`, completa `.gitignore` y agrega a `CLAUDE.md` un bloque de comandos con los scripts que **existen**. Nunca pisa texto existente.
4. **Huecos.** Si faltan `typecheck`, `lint` o `test`, decilo: sin ellos `stop-verify` y `feature-close` no verifican nada. Proponé crearlos como primera feature; no los inventes.
5. **Arquitectura.** Si no hay `architecture.json`, seguí con `arch-first` usando el tipo sugerido (si dice `web+api`, una arquitectura por app). Hasta que la persona la apruebe no se escribe código.
6. **Primeras decisiones.** Registrá con `adr` las decisiones de stack que el usuario confirme (gestor de paquetes, framework, despliegue).
7. Resumí en pocas líneas qué quedó hecho y qué falta, sin repetir los archivos.

## Reglas
- No inventes comandos ni versiones: todo sale de `detect.cjs` o de lo que diga el usuario.
- Sin nombres de cliente ni datos de tenant en ningún archivo versionado.
