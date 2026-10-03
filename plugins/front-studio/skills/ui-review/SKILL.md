---
name: ui-review
description: Revisa un diff o pantalla de frontend contra la dirección de diseño, los tics de UI generada, estados, accesibilidad y movimiento. Usar al terminar una rebanada de UI o antes de abrir un PR de frontend.
argument-hint: "[archivos o diff a revisar]"
---

# Review de UI

Revisión acotada a lo que importa. Si existe `design/direction.md`, es el criterio: no marques como defecto lo que la dirección decidió a propósito.

## Qué mirar (en este orden)
1. **Estados**: ¿están cargando, vacío, error, datos desactualizados, parcial y sin permiso? ¿Distingue "sin acceso" de "sin datos"?
2. **Accesibilidad**: cargá `references/a11y-checklist.md`. Verificá contraste con `node <base-de-brand-intake>/scripts/contrast.cjs` en vez de estimarlo.
3. **Movimiento**: contra la tabla de `direction.md`; `prefers-reduced-motion`; solo `transform` y `opacity`; nada que se actualice solo sin control para pausar.
4. **Tics de UI generada**: contra `design-direction/references/ai-tells.md` (si el repo no la tiene, usá el criterio: decoración sin tarea, tarjetas idénticas, métricas inventadas, rótulos en mayúsculas sobre todo).
5. **Texto de interfaz**: verbos claros, misma acción con el mismo nombre en todo el flujo, errores que dicen qué pasó y cómo corregirlo.
6. **Responsive**: 360, 768 y 1280 px; tablas con estrategia de desborde; sin scroll horizontal de página. Causa frecuente de desborde: un hijo de grilla con una tabla ancha necesita `min-width: 0` (o `minmax(0, 1fr)` en la columna).

## Salida
Hasta 12 hallazgos, ordenados por severidad, cada uno con archivo y línea, el problema, por qué importa y el cambio concreto:
- **P0**: rompe accesibilidad básica, pierde información, o muestra un estado engañoso (por ejemplo, datos viejos sin avisar).
- **P1**: degrada la experiencia o contradice la dirección.
- **P2**: pulido.

No revises estilo personal ni refactors que no estén en el diff. Si no hay hallazgos reales, decilo.
