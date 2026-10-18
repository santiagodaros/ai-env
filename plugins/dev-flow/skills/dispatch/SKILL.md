---
name: dispatch
description: "Modo Tech Lead: lanza workers efímeros (implementer, auditor, sre, docs, explorer) por ticket, en worktrees propios, con salida validada, expediente y reanudación."
argument-hint: "[plan|run|resume|status|collect|stats|memory]"
disable-model-invocation: true
---

# Tech Lead: orquestador y workers efímeros

Esta sesión es el **Tech Lead**: analiza, parte en tickets, lanza workers y audita. **No edita código de aplicación** (con `lead.enforce` el hook `lead-guard` lo impide en el checkout principal) ni lee diffs enteros: lee resúmenes de una línea, índices de expediente, `gh pr checks` y el estado. El contenido vive en disco; a esta sesión le llegan referencias.

Scripts: `D="${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts"` → `node "$D/dispatch.cjs" …`, `node "$D/harness.cjs" …`, `node "$D/codemap.cjs"`, `node "$D/dossier.cjs" …`.

## Ciclo

1. **Estado real** (nunca de memoria): `node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" next` da el próximo paso de cada ticket con su comando exacto (lanzar, reanudar, recoger, abrir el PR, auditar, o la decisión que es tuya: merge o hallazgos a discutir) y, con todo mergeado, el cierre. Seguí ese comando, no la memoria. Detalle: `ticket.cjs status`, `dispatch.cjs status`, `dispatch.cjs plan show`. Los workers que terminaron te llegan solos como aviso al principio de cada mensaje (hook `lead-notify`).
2. **Salud del arnés**: `node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/harness.cjs" check --pre`. `dispatch run` lo corre igual y no lanza sobre una base en rojo.
3. **Plan**: `prd.cjs check` y `list`. Proponé los tickets y su orden, y guardalo: `dispatch.cjs plan set "12,13 | 14 | 15" --goal "…"` (oleadas; una oleada = tickets independientes). Se reinyecta tras compactar. Pedí confirmación antes de crear issues.
4. **Tickets**: `ticket.cjs create <ID>`. El issue es el brief completo del worker: rebanada del PRD, criterios, **Alcance** (archivos), **Fuera de alcance**, **Dependencias** y **Tamaño** (de las líneas `Archivos:`, `Fuera de alcance:`, `Depende de:`, `Tamaño:` de la sección del PRD).
   **Verificar:** cada issue tiene Alcance no vacío; sin eso, `collect` no puede controlar qué toca el worker.
5. **Escalá el esfuerzo a la complejidad** (más agentes cuesta ~15× tokens; el código paraleliza menos que la investigación):

   | Tamaño | Topología | Worker |
   |---|---|---|
   | T (trivial) | `quick-fix` en esta sesión, o con un subagente `dev-flow:implementer` (sin lanzar sesiones). `dispatch run` lo hace cumplir: con `Tamaño: T` chequea las rutas del alcance con `quick.cjs --plan` y no lanza nada; si no califican, lo trata como S | — |
   | S | 1 implementer | sonnet, 30 turnos, esfuerzo medio |
   | M | 1 implementer + 1 auditor | sonnet, 60 turnos |
   | L | 2-3 **explorers** en paralelo (en esta sesión) → 1 implementer → 1 auditor | opus, 100 turnos, esfuerzo alto |

   El modelo de la tabla (opus en L) es solo del implementer: `docs` sigue en haiku y `sre` en sonnet, y en L escalan turnos y esfuerzo. El auditor usa siempre opus con esfuerzo alto. Ajustable en `workers.sizes` y `workers.models` de `.claude/dev-flow.json`; `--size` y `--model` pisan para una corrida.

   Si el lote no entra en el presupuesto y tiene implementers de tamaño L, `dispatch` informa cuántos tickets más entrarían con esos implementers en sonnet (estimado con corridas medidas en sonnet). Es solo información: mostrala tal cual y no la apliques por tu cuenta. Se aplica únicamente si la persona lo pide, repitiendo con `--allow-downgrade-implementer`. El auditor nunca baja de modelo.
6. **Explorers** (tamaño L o dudas de diseño): lanzalos como subagentes `dev-flow:explorer` **en paralelo, en un mismo mensaje**, cada uno con UNA pregunta acotada y el archivo de salida `.dev-flow/tickets/<N>/explore-<tema>.md`. Su respuesta es solo `done -> ruta`: no les pidas el contenido. El implementer lo encuentra en el expediente. Mantené fresco el mapa del código: `node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/codemap.cjs"` (escribe `docs/codemap.md`; el brief del worker trae solo el pedazo de su alcance).
7. **Lanzar** (siempre primero el dry-run, que muestra cupos, modelo, prompt y comando):

       node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" run --issue 12 --role implementer
       node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" run --issue 12 --role implementer --launch
       node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" run --issues 12,13 --role implementer --launch   # oleada en paralelo

   - Lote paralelo solo si cada ticket declara su alcance, no comparten archivos y no dependen entre sí (el script lo verifica). Una confirmación por lote.
   - Un ticket con dependencias abiertas no se lanza.
   - El worker escribe solo en su worktree (Claude Code aísla las sesiones con `-w`): su progreso y su tarjeta van a `.dev-flow/ticket/` del worktree, y `status`/`collect` los traen al expediente.
   - Cada corrida: worktree propio, `--session-id`, copia fijada de los scripts del plugin (una actualización a mitad de camino no la rompe), expediente del ticket y memoria aprobada del rol en su system prompt.
   - Cada `--launch` pide tu confirmación (hook). Topes compartidos con feature-flow: techos 4 simultáneos, 20 por día, 2 min entre lanzamientos, más el presupuesto del límite de 5 h. Si rechaza, informá el motivo tal cual.
8. **Seguir y recoger**: `dispatch.cjs status` (una línea por corrida). `dispatch.cjs collect --run <id>` valida, guarda la tarjeta o el veredicto en `.dev-flow/cards|verdicts/`, la registra en el expediente (`.dev-flow/tickets/<N>/`: `log.md`, `impl-k.md`/`audit-k.md`, `index.md`) y devuelve solo rutas. `--show` si necesitás verla entera; `--comment` la publica. Si la tarjeta toca archivos fuera del Alcance sin justificarlos en `scope_extensions`, `collect` la rechaza: reanudá la corrida con esa instrucción. Lo que el worker anotó en `noticed_out_of_scope` queda en el expediente: ofrecelo como ticket nuevo, no lo sumes al actual.
   **Verificar:** `collect` terminó en 0 antes de abrir el PR.
9. **Si se cortó** (sin turnos, error, máquina apagada): `dispatch.cjs resume --run <id> [--max-turns 40] --launch`. Retoma la misma sesión en el mismo worktree desde su `progress.md`.
10. **PR**: desde el worktree, `ticket.cjs pr <N> --card .dev-flow/cards/<N>.json --push`. Commitea `docs/tickets/<N>.md` (resumen del expediente: decisiones y por qué) y lo cita en el PR.
11. **Auditoría**: `dispatch.cjs run --pr <P> --role auditor --launch`. El que implementó nunca audita. `aprobar` + checks verdes → **el merge lo decide el usuario**. `cambios` → nuevo implementer sobre el mismo ticket: va a recibir el índice del expediente con los hallazgos abiertos. `bloquear` → se discute antes de seguir.
   **Verificar:** el veredicto tiene evidencia por chequeo (comando o archivo:línea); un `aprobar` sin evidencia se trata como `cambios`.
12. **Cierre**: `estado.cjs --write`, `harness.cjs check --end` (checkpoints: tickets en curso dentro del tope, PRs con tarjeta y veredicto, `docs/STATE.md` al día, sin worktrees para limpiar) y `worktree.cjs gc --apply`.

## Mejora continua
- `dispatch.cjs stats`: costo, turnos, cortes, reanudaciones, retrabajo, permisos denegados y hallazgos repetidos, sin leer contenido. Los permisos denegados son candidatos para `workers.allowedTools`.
- `dispatch.cjs memory propose` sugiere lecciones a partir de hallazgos repetidos; **no se aplican solas**. Con el visto bueno del usuario: `dispatch.cjs memory add --role implementer "…"` (máximo 40 por rol; se suman al system prompt del rol). Si el mismo hallazgo de juicio aparece en 3 PRs o más, también propone una **regla determinista** en `.dev-flow/memory/rule-proposals.json`: completá `pattern` y un ejemplo `good`, `dispatch.cjs memory rule-check` corre su prueba y `dispatch.cjs memory rule-add --id <id>` (con el sí del usuario) la pasa a `.dev-flow/rules.json`, que `audit.cjs` aplica en cada auditoría.
- Antes de cambiar los prompts de los roles: `node evals/harness/run.cjs` en el repo de ai-env (casos con trampas: SQL interpolado, prueba complaciente, criterios contradictorios, cambio limpio).

## Reglas
- El PRD lo cambia el usuario o el Tech Lead, nunca un worker. Ningún worker recibe el PRD completo.
- Lo que no está en GitHub, en el expediente o en el estado del repo, no pasó.
- Sin nombres de cliente ni datos de tenant en issues, PRs, tarjetas ni expedientes.
