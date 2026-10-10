---
name: prd
description: "PRD en rebanadas por id: list, check y slice de docs/PRD.md para un ticket."
argument-hint: "[list|slice <ID>|check|init]"
disable-model-invocation: true
---

# PRD en rebanadas

`docs/PRD.md` (o el que diga `.claude/dev-flow.json` en `prd`) es la fuente de verdad. Un worker recibe **solo** la rebanada de su ticket.

## Formato
- Cada requerimiento es un encabezado con id estable: `## [F-03] Exportar costos`.
- Prefijos: `G-` global (stack, restricciones; va en todas las rebanadas: mantenelas cortas), `F-` funcional, `NF-` no funcional. Otros prefijos de hasta 4 letras también valen.
- Criterios de aceptación como casillas (`- [ ] ...`) dentro de la sección: pasan al issue.
- Para citar otra sección, nombrá su id (`respeta NF-01`); para una decisión, `ADR-0003` (de `docs/decisions/`).

## Comandos

    node "${CLAUDE_PLUGIN_ROOT}/skills/prd/scripts/prd.cjs" init            # esqueleto si no existe
    node "${CLAUDE_PLUGIN_ROOT}/skills/prd/scripts/prd.cjs" list            # ids, títulos y criterios
    node "${CLAUDE_PLUGIN_ROOT}/skills/prd/scripts/prd.cjs" check           # ids repetidos, citas rotas, F- sin criterios
    node "${CLAUDE_PLUGIN_ROOT}/skills/prd/scripts/prd.cjs" slice F-03      # la rebanada (stdout); --out archivo

La rebanada lleva la sección pedida, las `G-*`, las secciones que cita (un nivel) y la decisión de cada ADR citado. Es determinista: no resume. Informa cuánto pesa respecto del PRD completo.

## Reglas
- Si `check` da errores, se corrigen antes de crear tickets: una cita rota es contexto que el worker no va a tener.
- Una sección que pasa de 6000 caracteres no es un ticket: partila.
- El PRD lo edita el Tech Lead o el usuario, no un worker. Si un worker encuentra un hueco, lo pregunta en su issue.
