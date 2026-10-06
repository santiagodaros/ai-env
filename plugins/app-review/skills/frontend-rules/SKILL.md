---
name: frontend-rules
description: Reglas de seguridad para componentes React (.tsx): variables de entorno públicas, login con PKCE, almacenamiento de tokens, HTML sin sanitizar y autorización del lado servidor. Aplicar al escribir o revisar componentes.
user-invocable: false
paths:
  - "**/*.tsx"
---

# Reglas de frontend (React)

- Toda variable de entorno que llega al bundle (`VITE_*`, `NEXT_PUBLIC_*`) es pública: nunca secretos ni credenciales.
- Login en el navegador con authorization code + PKCE (p. ej. MSAL). Nunca implicit flow.
- No guardar tokens en `localStorage`.
- No usar `dangerouslySetInnerHTML` con contenido sin sanitizar.
- La UI no autoriza: ocultar un botón no es un control de acceso; el backend valida.
- Las llamadas a Partner Center, Cost Management y Graph con credenciales van del lado servidor, no desde el navegador.
