---
name: plan
description: >-
  Plan de product engineer para una idea que la persona decidió avanzar: qué validar antes de construir, alcance con no-gos y agujeros evitados, hitos que entregan algo usable, rebanadas con criterios y tamaño, instrumentación de métricas, salida a producción y vuelta atrás. Genera PLAN.md y el PRD en el formato de /dev-flow:prd, listo para /arch:arch-first. Se invoca a mano con /idea-lab:plan seguido del slug.
disable-model-invocation: true
argument-hint: "[slug de la idea]"
allowed-tools: Bash(node *skills/plan/scripts/plan.cjs*), Bash(node *skills/shape/scripts/idea.cjs*)
---

# plan

Idea: $ARGUMENTS

`P="${CLAUDE_PLUGIN_ROOT}/skills/plan/scripts/plan.cjs"`. El plan vive en `docs/ideas/<slug>/plan.json`: vos lo completás, el script decide si está listo (`check`) y genera `PLAN.md` y el PRD (`render`).

Pensá como product engineer: el objetivo es aprender rápido qué funciona y entregar algo usable en cada hito, no planificar todo de antemano.

## Pasos

1. **Arranque.** `node "$P" new <slug>`. Rechaza si la idea no tiene la decisión "avanzar": en ese caso, decí que primero va `/idea-lab:shape <slug>` y frená.
   **Verificar:** existe `docs/ideas/<slug>/plan.json`, con el alcance y los riesgos que trajo de la idea.

2. **Primero, validar.** Por cada supuesto sin probar de la idea, el experimento más barato que lo confirma o lo refuta antes de construir: una landing con lista de espera, 5 entrevistas, un prototipo en papel, una consulta a datos que ya existen, un script de una tarde. Va a `validation_first` con `experiment`, `cost` y `success`. Si un supuesto no vale la pena probarlo, va a `accepted_assumptions` con el motivo.
   **Verificar:** `check` no lista supuestos sin plan.

3. **Alcance con forma.** `no_gos`: lo que explícitamente no se hace aunque lo pidan. `rabbit_holes`: los agujeros técnicos donde se puede ir el apetito, con la decisión que los evita (un servicio administrado en vez de uno propio, una versión manual primero).

4. **Rebanadas verticales.** Cada `slice` entrega algo que una persona puede usar o ver: no "la base de datos" sino "el usuario carga su primer gasto". Por cada una: `id` (F-01…, NF-01… para no funcionales), `title`, `why`, `criteria` (verificables, 1 a 7), `size` (T, S, M o L, como en `/dev-flow:dispatch`), `depends_on`. Las restricciones de stack van en `globals` (G-01); si todavía no se decidieron, dicen "por decidir en /arch:arch-first".
   **Verificar:** ninguna rebanada pasa de 7 criterios y no hay dependencias en ciclo.

5. **Hitos.** Agrupá las rebanadas en `milestones`: cada hito con `goal`, `exit_criteria` (qué ve o puede hacer un usuario al terminarlo) y `user_visible: true`. El primero es el camino mínimo de punta a punta, aunque sea feo.
   **Verificar:** cada rebanada está en exactamente un hito.

6. **Medir y salir.** `metrics_instrumentation`: cómo se mide cada métrica de la idea (evento, consulta o log, y dónde), empezando por la estrella. `rollout`: estrategia (piloto, bandera, por grupos) y cómo se vuelve atrás. `ops`: costo estimado por mes, marcado como estimado, y quién da soporte. `decisions_pending`: lo que necesita un ADR, con al menos dos opciones. A cada riesgo, un `owner_role` (un rol, no un nombre).

7. **Revisión en frío.** Lanzá el subagente `idea-lab:skeptic` con la ruta de `plan.json` y la pregunta: "¿qué hace fracasar este plan en el primer hito?". Si encuentra algo de severidad alta, ajustá el plan o anotalo como riesgo con mitigación.

8. **Generar.** `node "$P" check <slug>` y, en verde, `node "$P" render <slug>`. Escribe `PLAN.md` y el PRD: `docs/PRD.md` si no existe; si existe, `docs/ideas/<slug>/PRD.draft.md`, sin pisar nada. Mostrá en palabras simples: qué se valida primero, los hitos con lo que entrega cada uno, y el siguiente paso.

9. **Siguiente.** `/arch:arch-first` con el plan (ninguna línea de código antes de aprobar la arquitectura) → completar `Archivos:` en cada sección F- del PRD según la arquitectura, porque es el Alcance que controla cada ticket → `/dev-flow:prd check` → `/dev-flow:dispatch` (tickets y workers) o `/dev-flow:feature-run`.

## Excusas que no valen

| Excusa | Lo que corresponde |
|---|---|
| "Primero armamos la base y después la interfaz" | Cada hito entrega algo usable; una capa sola no es un hito |
| "Validar lleva tiempo, construyamos" | El experimento más barato casi siempre cuesta menos que la primera rebanada |
| "Las métricas las agregamos al final" | Si no se instrumenta desde el primer hito, no hay forma de saber si funcionó |
| "Vuelta atrás no hace falta, es nuevo" | Lo nuevo también se apaga: una bandera o una versión anterior alcanzan |

## Reglas

- Sin decisión "avanzar" no hay plan.
- No elijas el stack acá: es una decisión de arquitectura (`/arch:arch-first` y `/arch:adr`).
- Los costos son estimaciones y se marcan como tales; ningún número sin su cálculo.
