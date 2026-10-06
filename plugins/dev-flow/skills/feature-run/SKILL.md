---
name: feature-run
description: >-
  Lleva una feature de punta a punta en una corrida con compuertas: presupuesto, SPEC aprobado, implementación, pruebas, cierre con documentos y descripción de PR lista. Reanudable: cada corrida pregunta en qué etapa está. Solo se invoca a mano con /dev-flow:feature-run seguido de la descripción o del slug.
disable-model-invocation: true
argument-hint: "[descripción de la feature, o slug si ya existe]"
allowed-tools: Bash(node *skills/feature-run/scripts/stage.cjs*) Bash(node *skills/budget-plan/scripts/budget.cjs*) Bash(node *skills/feature-close/scripts/pr-body.cjs*)
---

# feature-run

Feature: $ARGUMENTS

Orquesta las skills de este plugin en secuencia. El estado vive en archivos y git, no en el chat: si se corta, otra corrida retoma donde quedó.

## ¿Hace falta el flujo completo?

Si el pedido es un arreglo puntual (un bug, un texto, un ajuste de pocas líneas en uno o dos archivos), no abras una feature: proponé `/dev-flow:quick-fix`. Su script decide con reglas fijas si califica; si no califica, volvés acá sin perder lo hecho.

## Antes de empezar (una sola confirmación)

Si `$ARGUMENTS` es una descripción y no un slug existente, proponé un slug (minúsculas, números y guiones, hasta 5 palabras) y avisá lo que vas a hacer: crear la rama `feature/<slug>`, escribir documentos en `docs/features/<slug>/`, implementar, cerrar con documentos y dejar la descripción del PR. **No** vas a hacer push ni abrir el PR sin un sí explícito. Pedí confirmación una vez.

## Bucle

Repetí hasta `done` o hasta una parada:

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/feature-run/scripts/stage.cjs" --slug <slug>`. Devuelve `stage`, el motivo y el paso siguiente.
2. Chequeá el presupuesto antes de cada etapa pesada (`implement`, `tests`, `close`): `node "${CLAUDE_PLUGIN_ROOT}/skills/budget-plan/scripts/budget.cjs" plan`. Si dice `sin-margen` o `no-alcanza`, **frená** y proponé las rebanadas como indica el plan.
3. Ejecutá la etapa:
   - `spec`: seguí `feature-flow` (corte, SPEC con el procedimiento de `spec-interview`, STATE, HANDOFF). **Parada humana**: el SPEC lo aprueba el usuario antes de implementar.
   - `commit-docs`: commit solo de `docs/features/<slug>`.
   - `implement`: creá o cambiá a la rama `feature/<slug>` si hace falta y desarrollá siguiendo el SPEC, con commits chicos. Escribí las pruebas junto con el código.
   - `tests`: la compuerta detectó código sin pruebas. Agregalas; si el usuario decide no tenerlas, que él declare `Sin pruebas: <motivo>` en el STATE (no lo escribas vos por tu cuenta).
   - `close`: seguí `feature-close`.
   - `pr`: `node "${CLAUDE_PLUGIN_ROOT}/skills/feature-close/scripts/pr-body.cjs" --slug <slug>` y commit de ese archivo.
4. Volvé al paso 1.

## Paradas (no las esquives)

- SPEC sin aprobar.
- Sin margen o sin presupuesto suficiente según `budget-plan`.
- Typecheck, lint o test fallan después de **2 intentos** de arreglar: frená, mostrá el error y pedí dirección. No sigas gastando.
- Cualquier rechazo de una compuerta que no puedas resolver sin el usuario.
- Antes de `git push` o `gh pr create`: sí explícito.

## Reglas

- No abras sesiones nuevas desde acá. Para otra feature, el usuario usa `feature-flow`.
- Cada etapa la valida un script, no tu opinión: `stage.cjs`, `collect.cjs`, `verify.cjs`.
- Si el trabajo no entra en una sola corrida por presupuesto, dejá el STATE al día y avisá desde qué etapa se retoma.
