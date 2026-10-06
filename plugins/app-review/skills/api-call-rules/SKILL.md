---
name: api-call-rules
description: Reglas para código TypeScript que llama a APIs de Microsoft (Cost Management, Partner Center, Graph, ARM) o accede a datos: caché y throttling, reintentos, managed identity y autorización por cliente. Aplicar al escribir o revisar ese código.
user-invocable: false
paths:
  - "**/*.ts"
---

# Reglas para llamadas a APIs y acceso a datos (TypeScript)

- Cost Management: como máximo una consulta por día por alcance (los datos se refrescan cada 4 horas). Cachear la respuesta; nunca consultar dentro de un loop ni por request de usuario sin caché.
- En un 429: respetar `Retry-After` o el header específico de la API (`x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after`, `retry-after-ms`); si no viene, backoff exponencial con jitter, máximo de reintentos y tope de espera.
- Si se agrega una librería de retry, el SDK va con reintentos desactivados (el SDK ya reintenta solo).
- No reintentar errores no transitorios (400, 401, 403, 404).
- Identidad: managed identity (`DefaultAzureCredential`/`ManagedIdentityCredential`) y scopes de mínimo privilegio. Validar emisor, audiencia y scope de los tokens recibidos.
- Cada endpoint verifica autorización sobre *ese* cliente o tenant; el identificador nunca se toma del input sin validar.
- Logs sin tokens ni datos de tenant. Consultas parametrizadas.
