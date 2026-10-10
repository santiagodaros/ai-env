---
name: ui-review
description: Revisa un diff o pantalla de frontend contra la dirección de diseño, los tics de UI generada, estados, accesibilidad, performance y movimiento, con analizadores deterministas y plan de corrección. Usar al terminar una rebanada de UI o antes de abrir un PR de frontend.
argument-hint: "[archivos o diff a revisar]"
---

# Review de UI

Revisión acotada a lo que importa. Si existe `design/direction.md`, es el criterio: no marques como defecto lo que la dirección decidió a propósito (sus tics permitidos están en la línea `ai-look-allow:`). El tipo de superficie (`${CLAUDE_PLUGIN_ROOT}/references/surfaces.md`) cambia la severidad.

Para revisar una UI **completa** con puntajes y opciones de rediseño, usá `/front-studio:ui-options`. Esta skill es para un diff o una pantalla.

## Primero, lo determinista
Sobre los archivos tocados (o la carpeta de la pantalla), y leé solo el resumen:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-scan.cjs" <archivos> --out design/review/a11y.json
    node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs" <archivos> --allow <ids de direction.md> --out design/review/ai-look.json

Si hay build o servidor local, también performance (con `--url` mide en Chromium si Playwright está disponible):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/perf-score.cjs" dist --url http://localhost:5173/ --out design/review/perf.json

No repitas a mano lo que el analizador ya marcó: citalo y pasá a lo que requiere juicio.

## Qué mirar (en este orden)
1. **Estados**: ¿están cargando, vacío, error, datos desactualizados, parcial y sin permiso? ¿Distingue "sin acceso" de "sin datos"?
2. **Accesibilidad**: cargá `references/a11y-checklist.md`. Verificá contraste con `node "${CLAUDE_PLUGIN_ROOT}/skills/brand-intake/scripts/contrast.cjs" "#fondo:#texto"` en vez de estimarlo. Lo que `a11y-scan` no puede ver (recorrido con teclado, lector de pantalla, zoom 200 %) va como verificación manual.
3. **Movimiento**: contra la tabla de `direction.md`; `prefers-reduced-motion`; solo `transform` y `opacity`; nada que se actualice solo sin control para pausar.
4. **Tics de UI generada**: la salida de `ai-look` más lo que solo se ve con juicio (`${CLAUDE_PLUGIN_ROOT}/skills/design-direction/references/ai-tells.md`): decoración sin tarea, jerarquía plana, métricas inventadas.
5. **Performance**: la salida de `perf-score`; en superficies de convencer pesa el LCP, en las de operar el TBT.
6. **Texto de interfaz**: verbos claros, misma acción con el mismo nombre en todo el flujo, errores que dicen qué pasó y cómo corregirlo.
7. **Responsive**: 360, 768 y 1280 px; tablas con estrategia de desborde; sin scroll horizontal de página. Causa frecuente de desborde: un hijo de grilla con una tabla ancha necesita `min-width: 0` (o `minmax(0, 1fr)` en la columna).

## Salida
Hasta 12 hallazgos, ordenados por severidad, cada uno con archivo y línea, el problema, por qué importa y el cambio concreto:
- **P0**: rompe accesibilidad básica, pierde información, o muestra un estado engañoso (por ejemplo, datos viejos sin avisar).
- **P1**: degrada la experiencia o contradice la dirección.
- **P2**: pulido.

No revises estilo personal ni refactors que no estén en el diff. Si no hay hallazgos reales, decilo.

## Plan de corrección
Si hay hallazgos, guardá los tuyos (los de juicio) en `design/review/review.json` con la misma forma que los analizadores (`source`, `id`, `title`, `severity`, `where`, `fix`, `effort` S/M/L) y generá el plan:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.cjs" design/review/*.json --title "<pantalla>" --target <archivos> --out design/review/PLAN.md

Con `--issues design/review/issues` deja un cuerpo por paquete y los comandos `gh issue create` para revisar y crear.
