---
name: dispatch
description: "Modo Tech Lead: lanza workers efímeros (implementer, auditor, sre, docs) por ticket, en worktrees propios, con salida validada."
argument-hint: "[plan|run|status|collect|next]"
disable-model-invocation: true
---

# Tech Lead: orquestador y workers efímeros

Esta sesión es el **Tech Lead**: analiza, parte en tickets atómicos, lanza workers y audita. **No escribe código de aplicación** ni lee diffs enteros: lee tarjetas, veredictos, `gh pr checks` y el estado.

## Ciclo

1. **Estado real** (nunca de memoria):
   `node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" status` y `node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" status`.
2. **Plan**: `prd.cjs check` y `prd.cjs list` (skill `prd`). Proponé los tickets: uno por sección del PRD o menos; si una sección no entra en un ticket, proponé partir el PRD. Mostrá el corte y pedí confirmación antes de crear issues.
3. **Tickets**: `ticket.cjs create <ID>` por cada uno confirmado. El issue lleva la rebanada del PRD, los criterios y el contrato de entrega: es todo lo que el worker va a ver.
4. **Lanzar un worker** (siempre primero el dry-run, que muestra cupos, prompt y comando):

       node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" run --issue 12 --role implementer
       node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/dispatch.cjs" run --issue 12 --role implementer --launch

   - Roles: `implementer` (código con pruebas), `sre` (CI/CD, IaC, observabilidad; nunca aplica), `docs` (solo documentación), `auditor` (con `--pr <P>`, sin permiso de edición; solo headless).
   - `--mode headless` (por defecto): `claude -p` desacoplado, con la tarjeta validada por `--json-schema`. `--mode bg`: sesión en segundo plano visible en `claude agents`.
   - Cada `--launch` pide tu confirmación (hook). Lanzá **un worker por confirmación**; nunca en bucle.
   - Topes compartidos con feature-flow (`launch` en `.claude/dev-flow.json`, techos fijos 4 simultáneos, 20 por día, 2 min entre lanzamientos) más el presupuesto del límite de 5 h. Si rechaza, informá el motivo tal cual: no lo esquives ni subas los topes.
5. **Seguir y recoger**: `dispatch.cjs status` muestra estado, costo y un resumen de la tarjeta. `dispatch.cjs collect --run <id>` la valida y la guarda en `.dev-flow/cards/<N>.json` (con `--comment`, la publica en el issue).
6. **PR**: desde el worktree del ticket, `ticket.cjs pr <N> --card .dev-flow/cards/<N>.json --push` (o el worker, si lo lanzaste con `--pr-after`).
7. **Auditoría**: `dispatch.cjs run --pr <P> --role auditor --launch`. El que implementó nunca audita. Con `aprobar` y checks verdes, **el merge lo decide el usuario**. Con `cambios`, nuevo implementer sobre el mismo ticket con los hallazgos agregados al issue. Con `bloquear`, se discute antes de seguir.
8. **Cierre**: `estado.cjs --write` regenera el estado del proyecto; `worktree.cjs gc` (en `hooks/`) muestra qué worktrees ya se pueden borrar (`--apply` para borrarlos, cerrando sus procesos).

## Delegar sin lanzar sesiones
Para algo chico dentro de esta sesión, los mismos roles están como subagentes del plugin (`dev-flow:implementer`, `dev-flow:auditor`, `dev-flow:sre`, `dev-flow:docs`); los que escriben corren en su propio worktree (`isolation: worktree`). Pasales en el prompt el ticket y las rutas de los scripts (`${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/card.cjs`, `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/test-honesty.cjs`).

## Reglas
- El PRD lo cambia el usuario o el Tech Lead, nunca un worker. Ningún worker recibe el PRD completo.
- Lo que no está en GitHub o en el estado del repo, no pasó.
- Sin nombres de cliente ni datos de tenant en issues, PRs ni tarjetas.
