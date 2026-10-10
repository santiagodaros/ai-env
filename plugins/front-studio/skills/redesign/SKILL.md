---
name: redesign
description: Orquesta el rediseño de una UI por etapas con compuertas; el estado vive en design/STATE.md.
argument-hint: "[brand|map|style|kit|direction|options|preview|port|review]"
disable-model-invocation: true
---

# Rediseño por etapas

Cada etapa lee el documento de la anterior y escribe el suyo. El chat es descartable; el estado está en `design/`. Entre etapas conviene `/clear`.

| Etapa | Skill | Lee | Escribe | Compuerta |
|---|---|---|---|---|
| 0 (si hay UI) | `ui-options` | la UI actual | `design/review/` (puntajes, `PLAN.md`, issues) y `design/options/` | El usuario elige dirección o decide rediseñar desde cero |
| 1 | `brand-intake` | kit de marca, CSS/tema del repo | `design/brand.md`, `design/tokens.css` | El usuario confirma paleta y fuentes |
| 2 | `product-map` | rutas y navegación del repo | `design/product-map.md` (con superficie por pantalla) | El usuario confirma la arquitectura de información |
| 2b | `style-quiz` | superficie y marca | `design/style.json` | El usuario confirma las perillas |
| 2c | `page-kit` | marca + estilo | `design/pages/<slug>/` | Sin pares de contraste fallando; el usuario vio la hoja de muestra |
| 3 | `design-direction` | lo anterior | `design/direction.md` (una u opciones) | El usuario elige UNA dirección |
| 4 | `live-preview` | lo anterior | `design/preview/index.html` | El usuario aprueba mirando el preview |
| 5 | `react-port` | preview aprobado | código en el repo, por rebanadas | Typecheck, lint y `ui-review` por rebanada |
| 6 | `ui-review` | el diff | hallazgos + `design/review/PLAN.md` | Sin P0 abiertos |

`preview-setup` va en cualquier momento: genera `.claude/launch.json` para el panel de preview de la app de escritorio y saca capturas de antes y después en la terminal.

## Qué hacer al invocarse

1. Si existe `design/STATE.md`, leelo y retomá en la primera etapa sin compuerta aprobada. Si no existe, copiá `STATE-template.md` de esta skill. Si el repo ya tiene una UI, ofrecé empezar por la etapa 0.
2. Si el argumento nombra una etapa, ejecutá solo esa (cargá la skill correspondiente).
3. No avances de etapa sin que el usuario haya aprobado la compuerta. Registrá la aprobación en `STATE.md` con fecha.
4. Máximo 3 preguntas por etapa (el quiz de estilo tiene las suyas). Lo que se pueda inferir del repo o de los documentos, inferilo y decilo.
5. Nada de nombres de cliente ni IDs de tenant en `design/`: usá "Cliente A", "Suscripción 1". Los documentos se versionan.
6. Las etapas 2b y 2c son opcionales si la marca y la dirección ya fijan todo; son obligatorias cuando una página tiene un trabajo distinto al resto (una landing dentro de una app de operación).

## Reglas de costo

- No leas el repo entero. Para mapear rutas usá un subagente `explorer` (o Grep dirigido) y quedate con el resumen.
- Un solo preview vivo, editado en el lugar. Las opciones van en una sola página con selector. Nunca "5 mockups".
- Lo determinista (contraste, tokens, look de IA, accesibilidad estática, performance) lo calculan los scripts del plugin: no lo estimes.
- Si la conversación se compacta, el estado es `design/STATE.md`, no el resumen.
