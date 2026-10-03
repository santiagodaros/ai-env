---
name: adr
description: >-
  Registra una decisión de arquitectura como página propia en docs/decisions/ (contexto, decisión, alternativas, consecuencias) y mantiene el índice. Usar cuando se cierre una decisión que afecte la estructura, la seguridad, las dependencias o el despliegue. Se invoca a mano con /adr seguido de la decisión.
disable-model-invocation: true
argument-hint: "[decisión a registrar]"
---

# adr

Decisión: $ARGUMENTS

1. Si falta algo, preguntá lo mínimo: qué se decidió, qué problema resuelve, qué otras opciones se evaluaron y qué se pierde con esta.
2. Crealo con el script (ruta base: la que muestra "Base directory for this skill"):
   `node <base>/scripts/adr.cjs new "<título corto>" --context "<...>" --decision "<...>" --alternatives "<...>" --consequences "<...>"`
   Cada sección sale de lo que dijo el usuario o de lo que consta en el código y el `SPEC.md`; si no lo sabés, dejá `(completar)` y avisalo. No inventes alternativas que nadie evaluó.
3. `node <base>/scripts/adr.cjs check` debe dar OK antes de commitear.
4. Una decisión no se reescribe: si cambia, creá otra ADR que la reemplace y marcá la anterior con `Estado: reemplazada por ADR-NNNN`.
5. Sin nombres de cliente ni datos de tenant.

Con `feature-close`: las decisiones del `STATE.md` marcadas con `[ADR]` se registran con esta skill al cerrar la feature.
