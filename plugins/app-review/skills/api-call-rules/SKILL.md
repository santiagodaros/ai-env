---
name: api-call-rules
description: "Reglas para código backend que expone o consume APIs (TypeScript, Python, C#): contrato OpenAPI antes del código, validación en el borde, timeout y reintentos solo en operaciones idempotentes respetando Retry-After, logs estructurados con trace id, managed identity y autorización por cliente. Aplicar al escribir o revisar ese código."
user-invocable: false
paths:
  - "**/*.ts"
  - "**/*.py"
  - "**/*.cs"
---

# Backend: contrato, borde, llamadas salientes y logs

En la arquitectura hexagonal, cada regla vive en un lugar: el contrato es el puerto de entrada, la validación va en el adaptador de entrada, la resiliencia en el adaptador de salida y el logger en la raíz de composición.

## Contrato primero (lo que exponés)
- Un endpoint nuevo o cambiado se escribe primero en el contrato (`docs/api/openapi.yaml` o el que use el repo) y después el código. Sin contrato en el repo, proponelo como decisión (`/arch:adr`); no lo inventes a mitad de una feature.
- La prueba de integración valida la respuesta contra el contrato: estado, cuerpo y errores. `audit` marca un endpoint que cambió sin tocar el contrato.
- Errores en un formato único (problem+json, RFC 9457), sin trazas internas.

## Borde (lo que entra)
- Validar con esquema (zod, pydantic, FluentValidation) en el adaptador de entrada y rechazar con 400 antes de llegar al dominio. Tope de tamaño de cuerpo.
- El identificador de cliente o tenant nunca se toma del input sin verificar que la identidad tiene acceso a ese cliente.

## Llamadas salientes
- Timeout en cada llamada.
- Reintentar solo lo transitorio (408, 429, 5xx, red) y solo operaciones idempotentes (GET, PUT, DELETE) o un POST con clave de idempotencia. Un POST que crea algo (una orden en Partner Center, un recurso) reintentado a ciegas puede duplicarlo.
- En un 429: respetar `Retry-After` o el header de la API (`x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after`, `retry-after-ms`); si no viene, backoff exponencial con jitter, máximo de reintentos y tope de espera total.
- Si el SDK ya reintenta, no se apila otra librería encima. En .NET, `AddStandardResilienceHandler` (Microsoft.Extensions.Http.Resilience) trae reintento, timeout y circuit breaker.
- Circuit breaker cuando una dependencia recibe tráfico sostenido y puede degradarse: falla rápido en vez de encolar. En un job de bajo volumen alcanza con backoff y tope.
- Cost Management: como máximo una consulta por día por alcance (refresca cada 4 horas), con caché; nunca dentro de un loop ni por request sin caché.

## Logs y traza
- En código de servicio, logger estructurado (JSON: nivel, mensaje, campos) en vez de `console.log` o `print`. Scripts y CLIs pueden escribir a consola.
- Cada línea lleva el trace id de la request. Con OpenTelemetry (Azure Monitor OpenTelemetry Distro) la correlación W3C (`traceparent`) viaja sola entre servicios: usá ese id, no inventes otro.
- Sin tokens, secretos ni datos de tenant en los logs.

## Identidad y datos
- Managed identity (`DefaultAzureCredential` o `ManagedIdentityCredential`) y scopes de mínimo privilegio. Validar emisor, audiencia y scope de los tokens recibidos.
- Consultas parametrizadas.
