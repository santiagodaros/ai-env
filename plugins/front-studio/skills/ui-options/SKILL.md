---
name: ui-options
description: Crítica completa de una UI (Nielsen, estados, accesibilidad, performance, look de IA) con plan de trabajo e issues, y tres direcciones más la estándar con selector.
argument-hint: "[URL, carpeta de la app o preview HTML] [pantallas a cubrir]"
disable-model-invocation: true
---

# Crítica y opciones de UI

Para una UI que ya existe (una app, un sitio, un preview, un artifact). Produce cuatro cosas: **puntajes**, **hallazgos con evidencia**, **plan de trabajo** y **opciones de rediseño**. Todo queda en `design/review/` y `design/options/`, no en el chat.

## 0. Alcance
- Qué se revisa: URL local o pública, carpeta del repo, `design/preview/index.html` o capturas. Qué pantallas (máximo 5 por corrida; si son más, priorizá las de la tarea principal).
- Tipo de superficie de cada pantalla (`${CLAUDE_PLUGIN_ROOT}/references/surfaces.md`): cambia qué pesa. Si no está en `design/product-map.md`, inferilo y decilo.
- Capturas de partida: si hay URL o servidor, `node "${CLAUDE_PLUGIN_ROOT}/skills/preview-setup/scripts/shots.cjs" before --url <url> --routes "<rutas>"`. Sirven de evidencia y de "antes".

## 1. Juicio de diseño (antes de mirar los analizadores)
El juicio va primero para que la salida de los scripts no lo ancle.
- Si podés lanzar subagentes, delegá esta pasada en uno nuevo con solo las capturas, las rutas de código y `references/nielsen.md`; sin la salida de los analizadores. Si no, hacela vos antes del paso 2.
- Puntuá las 10 heurísticas (0-4, con evidencia) y revisá estados (cargando, vacío, error, desactualizado, parcial, sin permiso), jerarquía y texto de interfaz.
- Escribí `design/review/heuristics.json` con el formato de `references/nielsen.md`.

## 2. Evidencia determinista
Leé solo los resúmenes; los JSON quedan para el plan.

    node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-scan.cjs" <carpeta-o-html> --out design/review/a11y.json
    node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs" <carpeta-o-html> --out design/review/ai-look.json
    node "${CLAUDE_PLUGIN_ROOT}/scripts/perf-score.cjs" <build-o-index.html> --url <url> --perfil movil --out design/review/perf.json

- Accesibilidad: además del análisis estático, si hay herramienta de navegador recorré la pantalla principal con Tab (captura del foco en 3 puntos) y probá 200 % de zoom. Lo que no se pudo probar queda en "sin verificar".
- Performance: con `--url` mide en Chromium local (FCP, LCP, TBT, CLS) con perfil móvil; sin URL es una estimación estática y así se informa. No lo presentes como Lighthouse.

## 3. Reconciliar
Si un analizador contradice el juicio, gana lo verificable; si el juicio ve algo que ningún script puede ver (jerarquía, copy, flujo), queda como hallazgo de juicio. Sin duplicados.

## 4. Plan de trabajo

    node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.cjs" design/review/heuristics.json design/review/a11y.json design/review/ai-look.json design/review/perf.json --title "<producto o pantalla>" --target <carpeta-o-html> --out design/review/PLAN.md --issues design/review/issues

`PLAN.md` ordena por severidad y esfuerzo, agrupa en paquetes por fase y área, y da un criterio de "hecho" por tarea (casi siempre: el analizador deja de informarlo). `design/review/issues/` trae un cuerpo por paquete y `crear-issues.txt` con los `gh issue create`: no los ejecutes sin que el usuario lo pida.

## 5. Tres direcciones más la estándar
- Cada dirección responde a los problemas principales del plan **de otra manera** y difiere de las otras en al menos tres ejes: disposición, voz tipográfica, estrategia de color, densidad, navegación, movimiento. Nombre, idea central (del mundo del producto), apuesta, riesgo y qué paquetes del plan resuelve.
- **Estándar de la categoría**: lo que haría un producto competente y convencional del rubro. Es la vara para medir el riesgo de las otras, no un hombre de paja: hacela bien.
- Respetá la marca (`design/tokens.css`) salvo que el usuario pida explorarla. Si hay `design/style.json`, una de las tres lo sigue al pie.
- Armá **una sola página** desde `templates/options-shell.html` en `design/options/<pantalla>.html`: contenido real e idéntico, tokens y reglas por `[data-dir="a|b|c|std"]`, bloques exclusivos con `data-only`. Se navega con las pestañas, flechas, `?dir=b` o `#dir-b`.
- Corré `ai-look` sobre la página (objetivo ≤ 15, sin contar la estándar) y `a11y-scan` (sin P0). Si hay navegador, capturá cada dirección a 1280 y 390 px y revisá desbordes.
- Mostrala: navegador local con `node "${CLAUDE_PLUGIN_ROOT}/skills/live-preview/scripts/serve.cjs" design/options`, el panel de preview de la app de escritorio (ver `preview-setup`) o un artifact HTML.

## 6. Entrega
En el chat, corto: tabla de puntajes (Nielsen /40, accesibilidad /100, performance /100 con su base, look de IA /100), los 5 problemas que más pesan, dónde está el plan y cómo ver las opciones. Pedí que elija una dirección (o una mezcla explícita).

## Compuerta
La dirección elegida se registra en `design/STATE.md` y en `design/direction.md`; de ahí siguen `page-kit` y `live-preview`. El plan se ejecuta por paquetes, cada uno con su verificación.

## Reglas
- Sin nombres de cliente ni datos reales en `design/`: "Cliente A", montos de ejemplo.
- No cambies la app durante la crítica: criticar, planificar y corregir son pasos separados.
- Distinguí siempre medido, inferido y sin verificar.
