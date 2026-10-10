# Verificación: cómo se demuestra que algo funciona

> Regla de oro: el agente no dice "funciona", lo demuestra. Toda entrega termina con evidencia ejecutable.

## Obligatorio en cada ticket
1. Una prueba por criterio de aceptación, que **falle sin el cambio** (`test-honesty` lo comprueba sacando el cambio).
2. Camino feliz y al menos un camino de error cuando la función puede fallar.
3. Las pruebas afirman resultados concretos (no "no lanza excepción", no `expect(true)`).
4. Sin mocks de la unidad bajo prueba; se mockean solo los bordes (red, disco, reloj).
5. Typecheck, lint y pruebas del repo en verde (comandos en CLAUDE.md).

## Evidencia en la tarjeta de entrega
- Cada comando con su código de salida real.
- Cada criterio con su prueba o archivo:línea.
- Lo no verificado, declarado como punto ciego.

## Antipatrones
- "Debería funcionar" sin prueba ejecutable.
- Pruebas que pasan igual sin el cambio.
- `.only` o `.skip` olvidados.
