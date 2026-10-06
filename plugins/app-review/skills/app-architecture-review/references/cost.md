# Lente: costos de API y de IA (del código de la aplicación)

Cada ítem se evalúa PASA / FALLA / N/A con evidencia `archivo:línea`.

## Cost Management API

- [ ] Se consulta como máximo una vez por día por alcance (los datos se refrescan cada 4 horas). Hay caché de la respuesta.
- [ ] No hay consultas dentro de loops, ni por request de usuario sin caché.
- [ ] Se conocen las cuotas QPU por tenant: 12 cada 10 segundos, 60 por minuto, 600 por hora. El código no las puede exceder por diseño.
- [ ] En un 429 se respeta el header `x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after`.

## Reintentos y límites (Foundry / Azure OpenAI y APIs en general)

- [ ] En un 429 se respeta `retry-after-ms` (o `Retry-After`); si no viene, backoff exponencial con jitter.
- [ ] Hay un máximo de reintentos y un tope de espera.
- [ ] Si se usa una librería de retry propia, el SDK tiene `max_retries=0` (no reintentos duplicados).
- [ ] No se reintentan errores que no son transitorios (400, 401, 403, 404).

## IA

- [ ] Los números y métricas salen de KQL / API deterministas; el modelo solo redacta la narrativa.
- [ ] El tamaño del prompt está acotado (no se envían tablas completas si alcanzan los agregados).
- [ ] Hay un límite de tokens de salida y un tope de gasto o de llamadas por ejecución.
- [ ] La salida del modelo no se usa para ejecutar acciones sin aprobación humana.

## Acciones con costo

- [ ] Compras de RI / Savings Plans u otras acciones con impacto económico requieren aprobación humana explícita.

## Fuentes (Microsoft Learn, verificadas el 2026-09-30)

- https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/manage-automation
- Guía de manejo de 429 en Foundry / Azure OpenAI (`retry-after-ms`, backoff con jitter, `max_retries=0` con librería de retry propia): buscar con `azure-claim-check` la página vigente antes de citarla.

Los ítems de IA (tamaño de prompt, tope de gasto) son práctica general; no están verificados contra Learn en este plugin.
