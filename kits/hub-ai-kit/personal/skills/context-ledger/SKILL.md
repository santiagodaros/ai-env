---
name: context-ledger
description: Mantiene un documento de estado (STATE) de un proyecto largo para que sobreviva a la compactación y a /clear. Usar cuando el usuario diga "checkpoint", "guardá el estado", "handoff" o "retomemos", cuando se cierre una decisión importante, antes de un /compact, o cuando parezca que el contexto fue resumido y se perdieron detalles previos.
---

# context-ledger

El chat es descartable; el estado vive en un archivo. Por defecto `docs/STATE.md` en el repo (o el que indique el usuario). Nunca incluir nombres de cliente ni datos de tenant.

## Formato del STATE (una página máximo)

Usar `STATE-template.md` de esta carpeta. Secciones:

1. Objetivo y alcance (2 líneas)
2. Decisiones firmes: qué, por qué, fecha
3. Hechos verificados: dato + fuente (URL) + fecha
4. Supuestos SIN verificar (separados de los hechos)
5. Correcciones ya hechas: errores que aparecieron y no deben repetirse
6. Identificadores exactos: nombres, endpoints, versiones, rutas, copiados literal
7. Pendientes y próximo paso
8. Reglas de trabajo: idioma, formato, restricciones

## Actualizar (checkpoint)

- Leer el STATE actual y editar solo los ítems que cambiaron. No reescribir todo.
- Identificadores: copiar literal, nunca parafrasear.
- Un hecho va en "verificados" solo si tiene fuente. Si no, va en "supuestos".
- Si pasa de una página, mover lo histórico a `docs/STATE-archive.md`.
- Al terminar, decir en una línea qué cambió.

## Antes de compactar

Si el usuario va a correr `/compact`, sugerir este texto para pasarle como indicación:

> Conservá literal: identificadores exactos, decisiones firmes con su motivo, correcciones ya hechas, y el próximo paso. Descartá exploración y ensayos fallidos.

Y confirmar que el STATE está al día antes de compactar.

## Rehidratar (chat nuevo, /clear o tras compactación)

1. Leer el STATE completo.
2. Resumir en 5 líneas lo entendido.
3. Pedir confirmación antes de continuar.
4. Si algo del resumen automático contradice el STATE, gana el STATE.
