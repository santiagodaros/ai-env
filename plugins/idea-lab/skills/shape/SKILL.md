---
name: shape
description: >-
  Toma una idea chica y la convierte en una idea definida: preguntas cerradas, análisis de mercado con fuentes (competidores, alternativas, señales de demanda), los ángulos que suelen faltar (negocio, factibilidad, riesgos, pre-mortem, métricas, criterio para abandonar), objeciones de un escéptico en frío y un comunicado con preguntas como vista previa. Termina con tu decisión: avanzar, pivotear o descartar. Se invoca a mano con /idea-lab:shape seguido de la idea.
disable-model-invocation: true
argument-hint: "[la idea en una o dos líneas, o el slug de una idea existente]"
allowed-tools: Bash(node *skills/shape/scripts/idea.cjs*), WebSearch, WebFetch
---

# shape

Idea: $ARGUMENTS

`I="${CLAUDE_PLUGIN_ROOT}/skills/shape/scripts/idea.cjs"`. El expediente vive en `docs/ideas/<slug>/idea.json`: vos lo completás con Write/Edit, el script decide qué falta (`check`) y arma la vista previa (`render`). Nunca declares la idea "definida" por tu cuenta: lo dice `check`, y la decisión es de la persona.

## Cómo hablar

- **Preguntas cerradas** con AskUserQuestion: la opción que recomendás primero, marcada "(Recomendado)", hasta 4 preguntas por llamada, **como mucho 3 rondas** en toda la skill. Texto libre solo donde no hay opciones.
- **Hechos y supuestos separados.** Un dato va como evidencia solo si tiene fuente (url, o "entrevista: …", "dato propio: …"). Si no, es un supuesto, con cómo probarlo.
- Una línea de avance entre pasos; el contenido va al archivo, no al chat.
- Sin nombres de cliente ni datos de tenant en el expediente: usá un alias. `check` frena si aparece un término de `.private-terms`.

## Pasos

1. **Arranque.** Si `$ARGUMENTS` es un slug existente (`node "$I" status`), seguí desde lo que falta según `node "$I" check <slug>`. Si no: `node "$I" new "<título corto>"`.
   **Verificar:** existe `docs/ideas/<slug>/idea.json`.

2. **Ronda 1: problema y apetito** (una llamada a AskUserQuestion, hasta 4 preguntas): quién sufre el problema; cómo lo resuelve hoy; para qué es (producto para vender, servicio, herramienta interna, aprendizaje); cuánto tiempo vale la pena invertir (apetito: 1 semana, 2 a 4 semanas, 1 a 3 meses). Proponé opciones a partir de la idea, no preguntas genéricas. Completá `pitch`, `problem`, `users` y `mvp.appetite`.
   **Verificar:** los ángulos `problema` y `usuarios` pasan en `check`, o lo que falta queda como pregunta abierta.

3. **Mercado.** Lanzá **2 o 3 subagentes `idea-lab:scout` en paralelo, en un mismo mensaje**, cada uno con un frente y su archivo de salida en `docs/ideas/<slug>/research/`:
   - `competidores.md`: productos directos y adyacentes, incluidos open source, con precio y qué hueco dejan;
   - `alternativas.md`: cómo se resuelve hoy sin un producto (planillas, scripts, consultoría, no hacer nada);
   - `demanda.md`: señales de que el dolor existe (foros, reseñas, issues, búsquedas, informes), con fecha.
   Cada uno responde una línea con la ruta. Leé los archivos y pasá a `market` solo lo que tiene url; `checked_at` es la fecha de hoy. `verdict`: `hueco`, `nicho`, `saturado` o `sin-datos`. Si no hay herramientas web en esta sesión, `verdict: sin-datos` con `unavailable_reason` y decilo: no inventes empresas ni precios.
   **Verificar:** el ángulo `mercado` pasa en `check`.

4. **Ronda 2: diferencia y alcance** (AskUserQuestion, hasta 4 preguntas), con lo que mostró el mercado: en qué se diferencia (opciones concretas contra los competidores encontrados), modelo de negocio o costo-beneficio, qué entra y qué queda afuera de la primera versión. Completá `value`, `business`, `mvp.in`, `mvp.out`.

5. **Ángulos que suelen faltar.** Completá vos, con lo que sabés y lo que encontraste, marcando como supuesto lo que no tiene fuente: `feasibility` (cómo se construiría y qué no se sabe), `risks` (al menos 3, de 3 tipos), `premortem` ("pasó un año y fracasó: ¿por qué?", al menos 3), `metrics` (estrella y umbral con número y plazo), `assumptions` (al menos 3, cada una con su prueba barata), `kill_criteria` (qué resultado haría abandonar), `prfaq` (comunicado como si ya existiera, y preguntas de usuarios e internas: costo, riesgo, por qué ahora).
   **Verificar:** `node "$I" check <slug>` muestra solo lo que depende de la persona o del escéptico.

6. **Escéptico en frío.** Lanzá el subagente `idea-lab:skeptic` con la ruta de `idea.json`. No escribió nada de esto y su trabajo es encontrar por qué no conviene. Pasá sus objeciones a `skeptic.objections` tal cual (no las suavices).
   **Verificar:** al menos 3 objeciones.

7. **Ronda 3: objeciones** (AskUserQuestion, hasta 4 preguntas): una por cada objeción de severidad `alta`, con opciones de respuesta (aceptar el riesgo, cambiar el alcance, sumar un supuesto a probar, abandonar). Escribí la respuesta en `answer`. Lo que quede sin respuesta va a `open_questions` con `blocking: true`.

8. **Vista previa.** `node "$I" render <slug>`: deja `IDEA.md` y `preview.html` (autocontenido; se abre en cualquier navegador, también desde el panel de preview). Mostrá en el chat, en palabras simples: la idea en dos líneas, el veredicto de mercado, los 3 riesgos principales, las objeciones altas y cómo se respondieron, y cuántos ángulos cubre.

9. **Decisión.** UNA pregunta: **Avanzar** (si `check` está en verde), **Pivotear** (qué cambiar), **Descartar**. Recomendá según la evidencia y los criterios para abandonar, no según el entusiasmo. Con la respuesta: `node "$I" decide <slug> <avanzar|pivotear|descartar> --reason "<motivo de la persona>"`. Si eligió avanzar, el siguiente paso es `/idea-lab:plan <slug>`; si eligió pivotear, volvé al paso 2 con el cambio.
   **Verificar:** el script aceptó la decisión (con avanzar, rechaza si `check` no está en verde).

## Excusas que no valen

| Excusa | Lo que corresponde |
|---|---|
| "No hay competencia" | Siempre hay una alternativa: una planilla, un script, una consultora o no hacer nada. Buscá cómo se resuelve hoy |
| "Seguro que la gente lo quiere" | Sin una señal con url o una entrevista, es un supuesto con su prueba |
| "El mercado es enorme" | Un número sin fuente no va. Importa quién paga primero, no el tamaño total |
| "Los riesgos los vemos después" | El pre-mortem es ahora: después es más caro |
| "La idea está clara, saltemos el escéptico" | Quien la armó no la audita. Sin objeciones no pasa `check` |

## Reglas

- No escribas código ni arquitectura acá: eso empieza después de la decisión, con `/idea-lab:plan` y `/arch:arch-first`.
- La decisión la toma la persona en el selector; vos registrás su respuesta con `decide`, nunca una que no dio.
- Si no hay herramientas web, decilo y seguí con `verdict: sin-datos`: es mejor una idea sin mercado relevado que un mercado inventado.
