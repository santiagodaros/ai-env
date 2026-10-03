# Superficies a revisar

Marcadas **[doc]** las que se apoyan en documentación oficial citable y **[práctica]** las que son práctica general de seguridad web. Usar OWASP ASVS y el Top 10 como lista de cobertura y verificar la versión vigente antes de citarla.

## Identidad y sesión
- Los tokens recibidos se validan en el backend: emisor, audiencia, firma, expiración y alcance. [doc: la documentación de la plataforma de identidad lo exige]
- Identidad de servicio por identidad administrada o federación; sin secretos de cliente en el repositorio ni en el bundle. [doc]
- Almacenamiento de tokens en el navegador: preferir memoria o cookies `HttpOnly` y `Secure` con `SameSite`; revisar `localStorage`. [práctica]
- Cierre de sesión que invalide del lado del servidor cuando aplique. [práctica]

## Autorización (la fuente más común de hallazgos graves)
- Cada endpoint verifica permiso sobre **ese** cliente o tenant, en el backend, no en la interfaz. [práctica]
- El identificador de cliente o recurso nunca se toma del input sin validar contra lo que el usuario puede ver (referencias directas inseguras). [práctica]
- Acciones con impacto (compras, cambios de permisos) exigen confirmación y registro de auditoría. [práctica]
- Pruebas negativas: un usuario del cliente A pidiendo datos del cliente B recibe error. [práctica]

## Entrada y salida
- Consultas parametrizadas; validación de esquema en el borde. [práctica]
- XSS: buscar `dangerouslySetInnerHTML`, Markdown o HTML de terceros sin sanear, `eval`, `new Function`. [práctica]
- SSRF: endpoints que reciben una URL y la consultan desde el servidor. [práctica]
- Redirecciones abiertas y manejo de parámetros de retorno. [práctica]

## Navegador
- Política de seguridad de contenido, `frame-ancestors` o `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`. [práctica; revisar la documentación de MDN para la sintaxis]
- CORS con lista explícita de orígenes, sin comodín junto a credenciales. [práctica]
- Mapas de código fuente y errores detallados fuera de producción. [práctica]

## Secretos y datos
- Sin credenciales en código, historial ni variables publicadas al bundle. [práctica]
- Logs sin tokens, contraseñas ni datos de tenant. [práctica]
- Datos sensibles cifrados en tránsito y en reposo según la plataforma. [doc: según el servicio]

## Dependencias y cadena de suministro
- Vulnerabilidades de producción, versiones fijadas, archivo de bloqueo versionado. [práctica]
- Acciones de CI fijadas por versión o hash y con permisos mínimos del token. [doc: guía de seguridad de GitHub Actions]
- CI con federación OIDC en lugar de secretos de larga vida. [doc]

## Resiliencia de la API
- Manejo de 429 con `Retry-After`, sin bucles de reintento sobre errores no transitorios. [doc: según la API consumida]
- Límites de tasa y de tamaño en endpoints propios. [práctica]
