---
name: frontend-rules
description: "Reglas para componentes React (.tsx): seguridad (variables públicas, login con PKCE, tokens, HTML sin sanitizar, autorización en el servidor), tipos de la API generados del contrato, los cuatro estados de datos asíncronos y datos fuera de los componentes de presentación. Aplicar al escribir o revisar componentes."
user-invocable: false
paths:
  - "**/*.tsx"
---

# Frontend (React)

## Seguridad
- Toda variable de entorno que llega al bundle (`VITE_*`, `NEXT_PUBLIC_*`) es pública: nunca secretos ni credenciales.
- Login en el navegador con authorization code + PKCE (p. ej. MSAL). Nunca implicit flow.
- No guardar tokens en `localStorage`.
- No usar `dangerouslySetInnerHTML` con contenido sin sanitizar.
- La UI no autoriza: ocultar un botón no es un control de acceso; el backend valida.
- Las llamadas a Partner Center, Cost Management y Graph con credenciales van del lado servidor, no desde el navegador.

## Tipos de la API
- Si el backend tiene contrato OpenAPI, los tipos se generan de él (openapi-typescript, orval) y se regeneran cuando cambia; no se tipan a mano. Sin contrato, el cliente de API valida la respuesta con zod.

## Datos asíncronos
- Todo componente que muestra datos asíncronos resuelve cuatro estados: cargando (esqueleto con la forma del contenido), error (mensaje claro y reintentar), vacío (qué puede hacer la persona) y con datos. `audit` marca los que faltan.
- Los componentes de presentación (`components/ui`, átomos, moléculas) reciben datos por props: no llaman a `fetch`, `axios` ni a stores globales. Los datos se piden en un hook (`useCostos`) o en el cliente de API, que es el adaptador de salida en `architecture.json`.

## Performance
- Medir antes de partir: el framework ya divide por ruta (Next, Vite con rutas lazy). `lazy()` para paneles pesados que no se ven al cargar; partir todo agrega cascadas de carga. `/front-studio:ui-review` mide LCP, TBT y CLS en Chromium.
