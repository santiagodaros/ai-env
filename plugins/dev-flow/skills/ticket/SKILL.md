---
name: ticket
description: "Tickets en GitHub desde el PRD, PR con Closes #N y tarjeta, tablero y estado del proyecto generado desde GitHub."
argument-hint: "[create <PRD-ID>|claim <N>|context <N>|pr <N>|status|estado]"
disable-model-invocation: true
---

# Tickets y estado en GitHub

El estado del trabajo vive en GitHub (issues, PRs, checks) y en el archivo de estado del repo, no en el chat. Necesita el GitHub CLI autenticado (`gh auth login`).

## Comandos

    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" labels             # una vez por repo
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" create F-03 [--type fix] [--dry-run]
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" claim 12             # asignado a vos, "en curso", rama y worktree
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" context 12           # lo que recibe el worker
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" pr 12 --card .dev-flow/cards/12.json --push
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/ticket.cjs" status               # tablero
    node "${CLAUDE_PLUGIN_ROOT}/skills/ticket/scripts/estado.cjs" --write              # regenera el estado

- `create` arma el issue con la rebanada del PRD, los criterios como casillas y el contrato de entrega; etiquetas `prd:<ID>`, `tipo:feat|fix` y `estado:listo`. Si ya hay un issue abierto para ese id, no duplica.
- `claim` devuelve la rama (`feat/<N>-<slug>`) y el nombre de worktree. Con `--develop` además la vincula al issue en GitHub.
- `pr` exige estar en la rama del ticket, arma el cuerpo con `Closes #N` y la tarjeta de entrega validada, y pasa el issue a "en revisión". No hace push salvo `--push`.
- `estado.cjs --write` escribe entre `<!-- estado:start -->` y `<!-- estado:end -->` del archivo de estado (`state` en `.claude/dev-flow.json`; por ejemplo `docs/ESTADO.md`): cobertura del PRD, en curso, bloqueados, listos y mergeado reciente. Lo que está fuera de las marcas (decisiones a mano) no se toca.

## Reglas
- Crear o editar issues y PRs cambia algo visible para el equipo: hacelo cuando el usuario lo pidió o cuando el flujo de `dispatch` lo indica, nunca "por las dudas".
- Un ticket = un entregable atómico que entra en una rebanada del PRD. Si no entra, se parte el PRD, no se agranda el issue.
- Sin nombres de cliente ni datos de tenant en issues ni PRs (son públicos para el equipo y quedan en el historial).
