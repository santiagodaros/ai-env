---
name: audit
description: "Auditoría zero-trust de un PR o rama de un worker: diff (inyección, timeouts, esquemas, tests complacientes), honestidad de las pruebas y tarjeta de entrega."
argument-hint: "[número de PR o rama base]"
---

# Auditoría zero-trust

El que implementó no audita. Esta skill la usa el subagente `auditor` (sin permiso de edición) o el Tech Lead antes de mergear.

## Evidencia determinista

    node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.cjs" --base main
    node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/test-honesty.cjs" --base main
    node "${CLAUDE_PLUGIN_ROOT}/skills/dispatch/scripts/card.cjs" verify <tarjeta.json> --base main --run-tests --issue <N>

- `audit.cjs` mira solo las líneas agregadas: llamadas externas sin timeout (fetch, axios, http, requests, HttpClient, Invoke-RestMethod), SQL o comandos armados con datos, eval, HTML sin sanitizar, entrada sin validación de esquema, `.only` y `.skip`, aserciones triviales, pruebas sin aserciones, mock del propio módulo bajo prueba. También: un endpoint que cambia sin tocar el contrato OpenAPI del repo (P1), endpoint en un repo sin contrato, `console.log`/`print` en código de servicio, datos asíncronos sin estado de carga, error o vacío, y componentes de presentación que piden datos (P2: señales para tu juicio, no prueba de error). Suma el escáner de seguridad del plugin y la prueba de honestidad. Sugiere un veredicto; sale con 1 si hay P0.
- `test-honesty.cjs` saca el cambio de código de la rama (deja las pruebas), corre las pruebas y restaura todo. Si pasan igual, las pruebas no cubren el cambio. Requiere el código commiteado; el comando sale de `testCommand` en `.claude/dev-flow.json` o del script `test`.
- `card.cjs verify` contrasta la tarjeta con el repo: archivos declarados contra los reales, comandos con error declarados como éxito, criterios sin evidencia; con `--run-tests` vuelve a correr las pruebas. Con `--issue <N>` también marca archivos fuera del Alcance del ticket sin justificar en `scope_extensions` y cambios de solo formato (espacios, sangría, líneas en blanco).

## Juicio (lo que no ve un script)
Esquemas y contratos de datos (¿la prueba de integración valida contra el contrato?), inyección en lugares no obvios, manejo de errores de llamadas externas (reintentos solo en operaciones idempotentes: un POST que crea algo reintentado a ciegas duplica), si las pruebas ejercitan el comportamiento pedido (no la implementación), cumplimiento de cada criterio del issue y alcance (archivos ajenos al ticket).

## Salida
Veredicto en JSON según `${CLAUDE_PLUGIN_ROOT}/skills/dispatch/schemas/verdict.schema.json`, validado con `card.cjs check <archivo> --verdict`. Cualquier P0 implica `bloquear`. Lo no verificado se declara como `no-verificado`.
