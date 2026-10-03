---
name: budget-plan
description: >-
  Dice cuánto del límite de 5 horas queda, estima cuánto necesita una feature según las ya medidas y propone cómo ejecutarla con el porcentaje disponible (ahora, justo o dividida en rebanadas). Solo se invoca a mano con /budget-plan seguido del slug de la feature.
disable-model-invocation: true
argument-hint: "[slug de la feature]"
---

# budget-plan

Feature: $ARGUMENTS

1. Corré `node <base>/scripts/budget.cjs plan` (ruta base: la que muestra "Base directory for this skill"). Muestra el disponible, el reinicio, la estimación y la recomendación.
2. Explicá el resultado en pocas líneas y proponé el siguiente paso según el estado:
   - `alcanza`: ejecutar ahora.
   - `justo`: ejecutar con effort bajo, `/compact` temprano y el subagente `explorer` para lecturas; frenar al 90% usado.
   - `no-alcanza`: crear una feature por rebanada con `/feature-flow` y arrancar solo la primera; el resto, después del reinicio.
   - `sin-margen`: no abrir sesiones nuevas hasta el reinicio.
   - `sin-estimacion` o `sin-datos`: ejecutar con un tope manual y medir.
3. Las mediciones se hacen solas: el hook `rehydrate` inicia la medición al arrancar la sesión de la feature y `feature-close` la cierra.

## Qué hay que saber

- El porcentaje no es en tokens y el límite es de la cuenta: incluye otras sesiones, chats y dispositivos. La estimación es el percentil 75 de lo medido en features anteriores, y con menos de 3 mediciones es el máximo. No es una predicción, es una referencia.
- Sin historial no se inventa nada: el script lo dice.
- El dato lo escribe la statusline del kit en cada respuesta de una sesión interactiva. Las sesiones en segundo plano no lo actualizan; si el dato está viejo, el script lo avisa.
- Solo funciona con planes que reciben `rate_limits` (Pro y Max). Con API no hay datos de límite.
- Config opcional `.claude/budget.json`: `reservePct` (mínimo 5), `safetyFactor` (entre 0.3 y 0.8).
