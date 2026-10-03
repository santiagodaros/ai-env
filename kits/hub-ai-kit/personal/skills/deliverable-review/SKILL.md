---
name: deliverable-review
description: >-
  Revisión final con checklist binaria (pasa/falla) de un entregable antes de enviarlo: informe, mail, documento, código a entregar. Usar cuando el usuario diga "revisá antes de entregar", "pre-entrega" o "chequeo final", o antes de enviar algo a cliente o management.
---

# deliverable-review

Alcance acotado: **corrección y requisitos**. No proponer mejoras de estilo ni "gaps" opcionales; un revisor al que se le pide encontrar problemas siempre encuentra alguno y eso es ruido.

## Checklist (cada ítem: PASA / FALLA + evidencia)

1. Cumple lo que se pidió (releer el pedido original, punto por punto).
2. Cada dato numérico o técnico tiene fuente o está marcado como no verificado.
3. Los cálculos se recomputaron (no se confía en la prosa).
4. Ningún nombre de cliente ni dato de tenant en archivos versionados o compartidos.
5. Conclusión y pedido están en las primeras líneas.
6. No hay contradicciones internas (mismos números y nombres en todo el documento).
7. Para código: tests corren y los escáneres del repo pasan.

## Salida

Tabla corta: ítem, resultado, evidencia. Después, solo las FALLAS con la corrección concreta. Si todo pasa, decirlo en una línea.

## Independencia

Para entregas de alto riesgo, correr esta revisión con el subagente `reviewer` (contexto limpio) en vez de en el mismo chat donde se produjo el trabajo.
