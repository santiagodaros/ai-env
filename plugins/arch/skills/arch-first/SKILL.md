---
name: arch-first
description: >-
  Antes de escribir código de un programa, página o automatización nuevo: define la arquitectura hexagonal con sus puertos y su seguridad por capa, muestra una vista previa, espera la aprobación del usuario y recién ahí habilita el código, que un hook y un verificador mantienen dentro de las capas. Solo se invoca a mano con /arch:arch-first seguido de la descripción del proyecto.
disable-model-invocation: true
argument-hint: "[qué se va a construir]"
allowed-tools: Bash(node *skills/arch-first/scripts/arch-check.cjs*) Bash(node *skills/arch-first/scripts/scaffold.cjs*) Bash(node *skills/arch-first/scripts/preview.cjs*)
---

# arch-first

Proyecto: $ARGUMENTS

Regla inicial para todo programa, página o automatización: arquitectura hexagonal (`references/hexagonal.md`) y línea base de seguridad (`references/security-baseline.md`), **diseñadas y aprobadas antes de escribir una sola línea de código**. La aprobación la da la persona; un hook bloquea escribir código sin ella.

## Procedimiento

1. **Mirá lo que hay.** Si ya existe `architecture.json`, corré `node "${CLAUDE_PLUGIN_ROOT}/skills/arch-first/scripts/arch-check.cjs"` y trabajá sobre esa arquitectura. Si hay código previo sin capas, seguí la sección "Código existente" de `references/hexagonal.md`.
2. **Entendé qué se construye.** Tipo (`web`, `api`, `automation`, `cli`) y lenguaje (`ts`, `py`, `ps1`). Si falta algo que cambie el diseño, hacé como máximo 4 preguntas (herramienta de preguntas): casos de uso, sistemas externos, quién lo usa, qué datos sensibles toca.
3. **Esqueleto sin código.** `node "${CLAUDE_PLUGIN_ROOT}/skills/arch-first/scripts/scaffold.cjs" --type <tipo> --lang <lenguaje> --name <nombre> [--dir <carpeta>]`. Crea carpetas con README por capa, `architecture.json`, `docs/architecture/ARCHITECTURE.md` y el ADR 0001. No escribe código.
4. **Completá el diseño.** En `architecture.json`: `ports.driving` (casos de uso y su adaptador de entrada) y `ports.driven` (dependencias externas y su adaptador de salida), y ajustá `forbiddenInCore`. En `ARCHITECTURE.md`: todas las secciones "(completar)", con la seguridad pensada por capa desde `references/security-baseline.md`. Solo cosas que dijo el usuario o se derivan del pedido; lo que no sepas, preguntalo.
5. **Vista previa.** `node "${CLAUDE_PLUGIN_ROOT}/skills/arch-first/scripts/preview.cjs"` genera `docs/architecture/preview.html` (diagrama, carpetas, reglas y seguridad). En la app de Claude, `--artifact` genera la versión para publicar como artifact HTML. Si el proyecto tiene UI, el aspecto visual lo resuelve `front-studio` (`live-preview`); acá se aprueba la estructura.
6. **Parada humana.** Mostrá el preview y pedí revisión. Decile al usuario que apruebe en una terminal aparte: `node "${CLAUDE_PLUGIN_ROOT}/skills/arch-first/scripts/approve.cjs"` (en la carpeta del proyecto). **No lo corras vos ni edites `Estado:` ni el sello**: un hook lo bloquea. La aprobación se invalida sola si cambia `architecture.json` o `ARCHITECTURE.md`.
7. **Implementación.** Con la arquitectura aprobada, el hook `arch-guard` permite escribir código solo dentro de las capas y rechaza imports que rompan la regla de dependencia, infraestructura en el núcleo o lectura de entorno fuera de config. Escribí las pruebas junto con el código.
8. **Verificación.** `node "${CLAUDE_PLUGIN_ROOT}/skills/arch-first/scripts/arch-check.cjs"` debe dar OK antes de cerrar; `dev-flow:feature-close` y `dev-flow:quick-fix` también lo exigen.

## Reglas

- No escribas código de la aplicación antes del paso 6. Esqueleto, documentos y vista previa sí.
- Si el diseño cambia a mitad de camino, cambiá `architecture.json` y `ARCHITECTURE.md`, pedí aprobación otra vez y registrá la decisión con `adr`.
- Sin nombres de cliente ni datos de tenant en ningún documento.
- El hook `arch-guard` viene en este plugin y actúa en cualquier carpeta con `architecture.json`. Si alguien lo apaga (`AI_ENV_HOOKS_SKIP=arch-guard`), la regla sigue en `arch-check.cjs` y en el CI, pero nada bloquea la escritura.
