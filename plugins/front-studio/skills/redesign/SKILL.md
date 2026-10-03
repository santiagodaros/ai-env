---
name: redesign
description: Orquesta el rediseño de una UI por etapas con compuertas (marca, mapa del producto, dirección, preview, port a React, review). El estado vive en design/STATE.md.
argument-hint: "[brand|map|direction|preview|port|review]"
disable-model-invocation: true
---

# Rediseño por etapas

Cada etapa lee el documento de la anterior y escribe el suyo. El chat es descartable; el estado está en `design/`. Entre etapas conviene `/clear`.

| Etapa | Skill | Lee | Escribe | Compuerta |
|---|---|---|---|---|
| 1 | `brand-intake` | kit de marca, CSS/tema del repo | `design/brand.md`, `design/tokens.css` | El usuario confirma paleta y fuentes |
| 2 | `product-map` | rutas y navegación del repo | `design/product-map.md` | El usuario confirma la arquitectura de información |
| 3 | `design-direction` | los dos anteriores | `design/direction.md` | El usuario elige UNA dirección |
| 4 | `live-preview` | los tres anteriores | `design/preview/index.html` | El usuario aprueba mirando el preview |
| 5 | `react-port` | preview aprobado | código en el repo, por rebanadas | Typecheck, lint y `ui-review` por rebanada |
| 6 | `ui-review` | el diff | hallazgos P0/P1/P2 | Sin P0 abiertos |

## Qué hacer al invocarse

1. Si existe `design/STATE.md`, leelo y retomá en la primera etapa sin compuerta aprobada. Si no existe, copiá `STATE-template.md` de esta skill y empezá por la etapa 1.
2. Si el argumento nombra una etapa, ejecutá solo esa (cargá la skill correspondiente).
3. No avances de etapa sin que el usuario haya aprobado la compuerta. Registrá la aprobación en `STATE.md` con fecha.
4. Máximo 3 preguntas por etapa, solo sobre lo que falte. Si algo se puede inferir del repo o de los documentos, inferilo y decilo.
5. Nada de nombres de cliente ni IDs de tenant en `design/`: usá "Cliente A", "Suscripción 1". Los documentos se versionan.

## Reglas de costo

- No leas el repo entero. Para mapear rutas usá un subagente `explorer` (o Grep dirigido) y quedate con el resumen.
- Un solo preview vivo, editado en el lugar. Nunca regeneres el archivo completo ni pidas "5 mockups".
- Si la conversación se compacta, el estado es `design/STATE.md`, no el resumen.
