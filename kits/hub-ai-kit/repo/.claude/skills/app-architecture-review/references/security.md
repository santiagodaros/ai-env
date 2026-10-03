# Lente: seguridad

Cada ítem se evalúa PASA / FALLA / N/A con evidencia `archivo:línea`. Lo que ya detectan CodeQL, gitleaks o Dependabot no se repite acá.

## Autorización (lo que los escáneres no ven)

- [ ] Cada endpoint que devuelve o modifica datos verifica **autorización**, no solo autenticación: que el usuario pueda actuar sobre *ese* cliente / tenant (GDAP / RBAC).
- [ ] El identificador de cliente o tenant nunca se toma del input sin validar contra lo que el usuario tiene permitido.
- [ ] No hay rutas "administrativas" protegidas solo por ocultarlas en la UI.
- [ ] Las acciones que modifican estado tienen registro de auditoría (quién, qué, sobre qué cliente, cuándo).

## Entradas y salidas

- [ ] Las entradas de la API se validan (tipo, longitud, formato) en el backend.
- [ ] Las consultas a bases de datos son parametrizadas.
- [ ] Las respuestas no devuelven más campos de los que el frontend necesita.
- [ ] Los errores al cliente no exponen trazas ni detalles internos.

## Logs y datos

- [ ] Los logs no incluyen tokens, secretos ni datos de tenant más allá de lo necesario.
- [ ] No hay datos reales de cliente en fixtures, tests ni archivos versionados.

## Frontend (React)

- [ ] No se usa `dangerouslySetInnerHTML` con contenido no sanitizado.
- [ ] Ningún control de acceso depende solo del estado del cliente.
- [ ] El bundle no contiene secretos (revisar variables de entorno expuestas).

## Dependencias

- [ ] Las dependencias nuevas son necesarias, mantenidas y están cubiertas por Dependabot.

Estos ítems son práctica general de seguridad de aplicaciones; no están verificados contra Microsoft Learn en este kit.
