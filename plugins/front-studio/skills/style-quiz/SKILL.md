---
name: style-quiz
description: Preguntas de opción múltiple que fijan el estilo de una página como perillas en design/style.json.
argument-hint: "[slug de la página] [superficie si ya se sabe]"
disable-model-invocation: true
---

# Quiz de estilo

Objetivo: pasar de "no sé qué estilo quiero" a perillas concretas y reproducibles, en tres rondas de preguntas, sin pedirle al usuario vocabulario de diseño.

## Pasos
1. **Contexto sin preguntar**: leé `design/brand.md`, `design/product-map.md` (tipo de superficie de la página) y `design/style.json` si existen. Lo que ya está decidido no se pregunta.
2. **Preset**: con la superficie conocida, arrancá del preset:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/style-quiz/scripts/style.cjs" --preset <operar|convencer|leer|experiencia> --page <slug>`
   (los rangos por superficie están en `${CLAUDE_PLUGIN_ROOT}/references/surfaces.md`).
3. **Preguntas**: usá `references/questions.md`. Hacelas con AskUserQuestion, de a una ronda (hasta 4 preguntas por llamada), con opciones concretas y, cuando ayude, un `preview` corto de cómo se vería. Sin AskUserQuestion (sesión sin interfaz), preguntá en texto con las mismas opciones numeradas.
4. **Guardá cada ronda** apenas se responde, solo con lo contestado:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/style-quiz/scripts/style.cjs" --set density=8 motion=1 type=tecnica`
   El script valida, conserva lo anterior y avisa si algo queda fuera del rango de la superficie.
5. **Cierre**: mostrá las perillas en una línea y qué implican en concreto (por ejemplo: "base 14 px, escala 1,2, radios suaves por jerarquía, sin animaciones de entrada"). Pedí confirmación o un ajuste puntual.

## Después
- `/front-studio:page-kit <slug>` genera el kit de la página con estas perillas sobre la marca global.
- `/front-studio:design-direction` las usa como punto de partida (modo `opciones` si el usuario quiere ver alternativas).

## Reglas
- Nunca más de 13 preguntas en total. Si el usuario dice "elegí vos", aplicá el preset y explicá las tres decisiones más visibles.
- `design/style.json` se versiona. Sin nombres de cliente ni datos reales.
- Una página por archivo de estilo: si hay varias páginas con estilos distintos, usá `--out design/styles/<slug>.json` y pasalo a page-kit con `--style`.
