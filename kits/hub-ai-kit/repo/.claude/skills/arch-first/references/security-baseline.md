# Línea base de seguridad por capa

Punto de partida al diseñar, no una garantía. Se inspira en las categorías de OWASP (Top 10 y ASVS); adaptala a las amenazas del programa y verificala con `security-diff` y con revisión humana.

## Adaptadores de entrada
- Autenticar y autorizar cada ruta o comando; denegar por defecto.
- Validar tipo, rango y tamaño de toda entrada en el borde; rechazar lo desconocido.
- Web: cabeceras de seguridad (CSP, `X-Content-Type-Options`, `frame-ancestors`), protección CSRF si hay cookies, CORS con orígenes explícitos (nunca `*` con credenciales), sin `innerHTML` ni `dangerouslySetInnerHTML` con datos no confiables.
- Límite de tasa en endpoints expuestos; errores genéricos hacia afuera, detalle solo en logs.

## Aplicación y dominio
- Autorización de negocio dentro del caso de uso (no solo en la ruta).
- Invariantes en el dominio; sin E/S, sin secretos, sin acceso a entorno.
- Mensajes de error que no revelen estructura interna.

## Adaptadores de salida
- Consultas parametrizadas; nunca concatenar entrada en SQL, KQL, shell o rutas.
- Identidad administrada o credenciales de corta vida; mínimo privilegio (RBAC al alcance mínimo, scopes de Graph solo los necesarios, evitar `*.ReadWrite.All` si basta menos).
- HTTP saliente: lista permitida de destinos (contra SSRF), TLS verificado (nunca desactivarlo), timeouts y reintentos acotados.
- No registrar secretos, tokens ni datos personales.

## Config y repositorio
- Único lugar que lee entorno; secretos en un gestor (por ejemplo Key Vault), no en el repo ni en `.env` versionado.
- Fallar al arrancar si falta configuración obligatoria.
- Dependencias con versión fija y lockfile versionado; revisar toda dependencia nueva; análisis de secretos y dependencias en CI.
- Sin identificadores de tenant, suscripción ni clientes en el código ni en los documentos versionados.

## Automatizaciones
- Modo de simulación (`-WhatIf`, `--dry-run`) por defecto en acciones destructivas; confirmación explícita para ejecutar.
- Registro de qué se cambió y con qué identidad, sin datos sensibles.
- Idempotencia: ejecutar dos veces no debe romper nada.
